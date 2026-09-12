
// What a deploy says to `smogonctl assets upload` before it sends anything, and
// how it reads the answer.
//
// Every published name carries a content hash and the served tree is add-only, so
// a name the home already has is a file that needn't travel. The deploy therefore
// opens the stream with a manifest -- every name with its size, and every link --
// and the command answers with the positions of the ones it hasn't got. Only those,
// plus the __meta/ files, are then tarred into the same stdin. The same connection
// and the same command line as a bare tar; the tar is just shorter.
//
// The format is binary and every string is length prefixed, so a name is whatever
// bytes a tar would carry for it and nothing in the framing could be mistaken for
// one. The server side spells it out in smogonctl's assets command; this is the
// other half, and the two are tested against each other by shape rather than
// sharing code.
//
//   "smogonctl assets"  u32 version=1  u32 count
//   count times:  u8 kind
//                 kind 1 (asset)      u64 size  u32 len  path
//                 kind 2 (metadata)   u64 size  u32 len  path      (always sent)
//                 kind 3 (link)       u32 len  path  u32 len  linkname
//
// The reply is the same header with the count of what's wanted, then that many u32
// positions into the manifest. Whatever the command prints after that is its own
// report, relayed as is.

import type {ChildProcess} from 'node:child_process';
import * as fs from 'node:fs/promises';

import {type ActionQueue} from './queue.ts';

export let MAGIC = Buffer.from('smogonctl assets');
export let VERSION = 1;
let HEADER_SIZE = MAGIC.length + 4 + 4;
let ASSET = 1;
let METAFILE = 2;
let LINK = 3;
let META = '__meta';

export type Manifest = {
    bytes: Buffer,
    // The published name at each position: what a position in the reply means.
    entries: string[],
    // Positions that are assets, the only ones a reply may name.
    assets: Set<number>,
    // Names the tar carries whatever the reply says.
    metaFiles: Set<string>,
};

function isMeta(dst: string): boolean {
    return dst === META || dst.startsWith(`${META}/`);
}

function u32(n: number): Buffer {
    let b = Buffer.alloc(4);
    b.writeUInt32BE(n);
    return b;
}

function u64(n: number): Buffer {
    let b = Buffer.alloc(8);
    b.writeBigUInt64BE(BigInt(n));
    return b;
}

function str(s: string): Buffer {
    let raw = Buffer.from(s);
    return Buffer.concat([u32(raw.length), raw]);
}

// The manifest for what `filter` selects of the queue, in queue order: the order
// the tar's entries would come in, and the order the reply's positions index.
export async function manifestOf(aq: ActionQueue, filter?: (dst: string) => boolean): Promise<Manifest> {
    let parts: Buffer[] = [];
    let entries: string[] = [];
    let assets = new Set<number>();
    let metaFiles = new Set<string>();
    for (let entry of aq.log) {
        if (entry.type !== 'Op' || (filter !== undefined && !filter(entry.dst))) {
            continue;
        }
        let op = entry.op;
        let index = entries.length;
        entries.push(entry.dst);
        if (op.type === 'Symlink') {
            parts.push(Buffer.from([LINK]), str(entry.dst), str(op.target));
            continue;
        }
        // The size the tar header will carry: a Write's data goes in as utf-8, the
        // same way tar-stream takes the string.
        let size = op.type === 'Copy' ? (await fs.stat(op.src)).size : Buffer.byteLength(op.data);
        if (isMeta(entry.dst)) {
            metaFiles.add(entry.dst);
            parts.push(Buffer.from([METAFILE]));
        } else {
            assets.add(index);
            parts.push(Buffer.from([ASSET]));
        }
        parts.push(u64(size), str(entry.dst));
    }
    let bytes = Buffer.concat([MAGIC, u32(VERSION), u32(entries.length), ...parts]);
    return {bytes, entries, assets, metaFiles};
}

export type Outcome = 'pending' | 'ok' | 'refused';

// The reply, read as it arrives. Strict from the first byte: the command's stdout
// is either a reply followed by its report, or it is a refusal, and a refusal is
// relayed whole. Nothing that isn't the reply is skipped over to find one, since
// anything printing on that stream ahead of the command is something the deploy
// shouldn't be talking through -- a shell profile, a filter -- and finding out is
// better than working around it.
export class Reply {
    outcome: Outcome = 'pending';
    // Why a refusal was ours rather than the command's, or null where the command
    // said so itself and its words were relayed.
    error: string | null = null;
    wanted = new Set<string>();
    #manifest: Manifest;
    #sink: (chunk: Buffer) => void;
    #buf = Buffer.alloc(0);
    #count = -1;
    #seen = new Set<number>();

    constructor(manifest: Manifest, sink: (chunk: Buffer) => void) {
        this.#manifest = manifest;
        this.#sink = sink;
    }

    feed(chunk: Buffer): void {
        if (this.outcome !== 'pending') {
            this.#sink(chunk);
            return;
        }
        this.#buf = Buffer.concat([this.#buf, chunk]);
        // Refused as early as the bytes disagree, not once there are enough of
        // them: a one-line message is shorter than a header.
        let head = this.#buf.subarray(0, MAGIC.length);
        if (!head.equals(MAGIC.subarray(0, head.length))) {
            this.#refuse('the command didn\'t answer the manifest');
            return;
        }
        if (this.#buf.length < HEADER_SIZE) {
            return;
        }
        if (this.#count < 0) {
            let version = this.#buf.readUInt32BE(MAGIC.length);
            if (version !== VERSION) {
                this.#refuse(`the command answered with version ${version}, and this speaks ${VERSION}`);
                return;
            }
            this.#count = this.#buf.readUInt32BE(MAGIC.length + 4);
        }
        let offset = HEADER_SIZE + 4 * this.#seen.size;
        while (this.#seen.size < this.#count && this.#buf.length >= offset + 4) {
            let index = this.#buf.readUInt32BE(offset);
            offset += 4;
            let dst = this.#manifest.entries[index];
            if (dst === undefined || !this.#manifest.assets.has(index)) {
                this.#refuse(`the command asked for position ${index}, which isn't an asset in the manifest`);
                return;
            }
            if (this.#seen.has(index)) {
                this.#refuse(`the command asked for ${dst} twice`);
                return;
            }
            this.#seen.add(index);
            this.wanted.add(dst);
        }
        if (this.#seen.size === this.#count) {
            this.outcome = 'ok';
            let rest = this.#buf.subarray(offset);
            this.#buf = Buffer.alloc(0);
            if (rest.length > 0) {
                this.#sink(rest);
            }
        }
    }

    // The stream closed. A reply still being read is a command that went away
    // without finishing its answer.
    end(): void {
        if (this.outcome === 'pending') {
            this.#refuse('the command hung up before answering the manifest');
        }
    }

    #refuse(error: string): void {
        this.outcome = 'refused';
        this.error = error;
        let held = this.#buf;
        this.#buf = Buffer.alloc(0);
        if (held.length > 0) {
            this.#sink(held);
        }
    }
}

// Send the manifest and read the reply: the names to tar, or null where the
// command refused. On a refusal stdin is closed, so a command waiting for a tar
// sees the end of the stream rather than a deploy waiting for it; everything it
// printed is relayed to `sink` either way, and goes on being relayed after.
export function negotiate(child: ChildProcess, manifest: Manifest,
                          sink: (chunk: Buffer) => void = chunk => { process.stdout.write(chunk); })
    : Promise<{wanted: Set<string>} | {error: string | null}> {
    let stdin = child.stdin;
    let stdout = child.stdout;
    if (stdin === null || stdout === null) {
        throw new Error('negotiate needs the command\'s stdin and stdout piped');
    }
    return new Promise(resolve => {
        let reply = new Reply(manifest, sink);
        let settled = false;
        let settle = () => {
            if (settled || reply.outcome === 'pending') {
                return;
            }
            settled = true;
            if (reply.outcome === 'refused') {
                stdin.end();
                resolve({error: reply.error});
            } else {
                resolve({wanted: reply.wanted});
            }
        };
        // Attached before the manifest goes out and kept for the whole run: the
        // reply can be longer than a pipe holds, and the report after it has to
        // land somewhere while the tar is going the other way.
        stdout.on('data', (chunk: Buffer) => {
            reply.feed(chunk);
            settle();
        });
        stdout.on('end', () => {
            reply.end();
            settle();
        });
        // A command that dies on the manifest closes the pipe under this write;
        // its exit code is the report, not the EPIPE.
        stdin.write(manifest.bytes, () => {});
    });
}
