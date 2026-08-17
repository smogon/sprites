
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';

import b32encode from 'base32-encode';

import {Artifact} from '../build/artifact.ts';
import {casPath} from '../build/cas.ts';
import {type ActionQueue} from './queue.ts';
import * as pathlib from './path.ts';

// A source-tree file from ctx.list(); shaped like a deploy Path plus the
// repo-relative path.
export type SrcFile = pathlib.Path & {
    path: string,
};

export type CopySource = Artifact | SrcFile | string;   // string = repo-relative path

// The finish API: nice naming over built artifacts and raw sources. Ops are
// queued in call order, which is the tar entry order.
export type DeployCtx = {
    // copy and write queue ops without touching the disk, so they are sync;
    // read, list, and hash do file I/O.
    copy(src: CopySource, dst: string): void,
    write(dst: string, data: string): void,
    read(src: CopySource): Promise<string>,
    list(dir: string): Promise<SrcFile[]>,
    // 8-char base32 content stamp. One source: the digest of its bytes,
    // byte-compatible with artifact hashes. Several: a digest of the sorted
    // per-source digests (order-insensitive).
    hash(...srcs: CopySource[]): Promise<string>,
};

export type DeployFn = (ctx: DeployCtx) => void | Promise<void>;

// Like rule(): a buildFile registers free-floating deploy blocks next to the
// rules they ship. They run in registration order after the build, sharing
// one ctx (and so one output tree) per buildFile.
let deploys: DeployFn[] = [];

export function deploy(fn: DeployFn): void {
    deploys.push(fn);
}

export function getDeploys(): readonly DeployFn[] {
    return deploys;
}

export function resetDeploys(): void {
    deploys.length = 0;
}

function shortHash(digest: Buffer): string {
    return b32encode(digest, 'RFC4648').slice(0, 8);
}

export function makeCtx(casDir: string, queue: ActionQueue): DeployCtx {
    // Every path here is repo-root-relative; the CLI chdirs to the root.
    let srcPath = (src: CopySource): string => {
        if (src instanceof Artifact) {
            return casPath(casDir, src.hash, src.ext);
        }
        return typeof src === 'string' ? src : src.path;
    };
    let digestOf = async (src: CopySource): Promise<Buffer> => {
        if (src instanceof Artifact) {
            return Buffer.from(src.hash, 'hex');
        }
        return crypto.createHash('sha256').update(await fs.readFile(srcPath(src))).digest();
    };
    return {
        copy(src: CopySource, dst: string): void {
            queue.copy(srcPath(src), dst);
        },
        write(dst: string, data: string): void {
            queue.write(data, dst);
        },
        async read(src: CopySource): Promise<string> {
            return await fs.readFile(srcPath(src), 'utf8');
        },
        async list(dir: string): Promise<SrcFile[]> {
            let result = [];
            // Files only, no dotfiles: the same filtering the build-side
            // glob applies to rule inputs.
            let ents = await fs.readdir(dir, {withFileTypes: true});
            for (let ent of ents.sort((a, b) => a.name < b.name ? -1 : 1)) {
                if (ent.name.startsWith('.') || (!ent.isFile() && !ent.isSymbolicLink())) {
                    continue;
                }
                let p = pathlib.path(ent.name, {dir});
                result.push({...p, path: pathlib.format(p)});
            }
            return result;
        },
        async hash(...srcs: CopySource[]): Promise<string> {
            let [only] = srcs;
            if (only !== undefined && srcs.length === 1) {
                return shortHash(await digestOf(only));
            }
            let digests = (await Promise.all(srcs.map(digestOf))).sort(Buffer.compare);
            let h = crypto.createHash('sha256');
            for (let d of digests) {
                h.update(d);
            }
            return shortHash(h.digest());
        },
    };
}
