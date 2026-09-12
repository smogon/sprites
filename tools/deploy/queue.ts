
import * as fs from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import * as nodePath from 'node:path';
import tar from 'tar-stream';

type Op = {
    type: 'Write',
    data: string,
} | {
    type: 'Copy',
    src: string,
} | {
    type: 'Symlink',
    target: string,
};

type OpEntry = {
    type: 'Op',
    op: Op,
    dst: string,
    valid: 'Success' | 'Absolute' | 'Multiple' | 'Escapes',
    debugObjs: unknown[]
};

type DebugEntry = {
    type: 'Debug',
    obj: unknown,
    stray: boolean
};

export type LogEntry = OpEntry | DebugEntry;

// What a link names, resolved lexically against the directory it sits in: the
// tree it describes isn't on disk anywhere yet, so there is nothing else to
// resolve against. Null where it walks out of the tree, or names the tree
// itself, neither of which is a name this tree can publish.
function resolveLink(dst: string, target: string): string | null {
    let parts = nodePath.dirname(dst).split('/').filter(p => p !== '' && p !== '.');
    for (let part of target.split('/')) {
        if (part === '' || part === '.') {
            continue;
        }
        if (part !== '..') {
            parts.push(part);
        } else if (parts.length > 0) {
            parts.pop();
        } else {
            return null;
        }
    }
    return parts.length === 0 ? null : parts.join('/');
}

export class ActionQueue {
    #seen: Map<string, OpEntry | 'MoreThan1'>;
    // Have an accessor for this in the future? idk
    public log: LogEntry[];
    public valid: boolean;
    #debugBuffer: unknown[];

    constructor() {
        this.#seen = new Map;
        this.log = [];
        this.valid = true;
        this.#debugBuffer = [];
    }

    throw(obj: unknown) {
        this.gdebug(obj, false);
        this.valid = false;
    }

    debug(obj: unknown) {
        this.#debugBuffer.push(obj);
    }

    gdebug(obj: unknown, stray: boolean) {
        this.log.push({type: 'Debug', obj, stray});
    }

    #pushOp(op: Op, dst: string): OpEntry {
        dst = nodePath.normalize(dst);
        let entry: OpEntry = {
            type: 'Op',
            op,
            dst,
            valid: 'Success',
            debugObjs: this.#debugBuffer
        };
        this.log.push(entry);
        this.#debugBuffer = [];
        if (nodePath.isAbsolute(dst)) {
            this.valid = false;
            entry.valid = 'Absolute';
        } else {
            let lastEntry = this.#seen.get(dst);
            if (lastEntry === undefined) {
                this.#seen.set(dst, entry);
            } else {
                this.valid = false;
                entry.valid = 'Multiple';
                if (lastEntry !== 'MoreThan1') {
                    lastEntry.valid = 'Multiple';
                }
            }
        }
        return entry;
    }

    copy(src: string, dst: string) {
        this.#pushOp({type: 'Copy', src}, dst);
    }

    write(data: string, dst: string) {
        this.#pushOp({type: 'Write', data}, dst);
    }

    // A link the receiving side extracts as root, so its target may only name
    // something else in this tree.
    symlink(target: string, dst: string) {
        let entry = this.#pushOp({type: 'Symlink', target}, dst);
        if (nodePath.isAbsolute(target) || resolveLink(entry.dst, target) === null) {
            this.valid = false;
            entry.valid = 'Escapes';
        }
    }

    skip() {
        for (let obj of this.#debugBuffer) {
            this.gdebug(obj, true);
        }
        this.#debugBuffer = [];
    }

    print(level: 'errors' | 'all') {
        for (let entry of this.log) {
            if (entry.type === 'Op') {
                let op = entry.op;
                if (entry.valid === 'Success' && level === 'errors')
                    continue;
                let addendum = '';
                if (entry.valid !== 'Success') {
                    addendum = ` (${entry.valid})`;
                }
                for (let obj of entry.debugObjs) {
                    console.error('DEBUG:', obj);
                }
                if (op.type === 'Copy') {
                    console.error(`COPY${addendum}: ${op.src} ==> ${entry.dst}`);
                } else if (op.type === 'Write') {
                    console.error(`WRITE${addendum}: ${op.data.length} characters ==> ${entry.dst}`);
                } else if (op.type === 'Symlink') {
                    console.error(`SYMLINK${addendum}: ${entry.dst} -> ${op.target}`);
                }
            } else if (entry.type === 'Debug') {
                let addendum = '';
                if (entry.stray) {
                    addendum = ` (stray)`;
                }
                console.error(`GDEBUG${addendum}:`, entry.obj);
            }
        }
    }

    // `onFile` is called once per published name as it lands, for progress.
    async run(dir: string, mode: 'link' | 'copy' | 'tar', filter?: (dst: string) => boolean,
              onFile?: () => void) {
        if (!this.valid)
            throw new Error(`Invalid ActionQueue`);
        if (mode !== 'tar') {
            for (let entry of this.log) {
                if (entry.type !== 'Op' || (filter !== undefined && !filter(entry.dst)))
                    continue;
                let op = entry.op;
                let dst = nodePath.join(dir, entry.dst);
                await fs.mkdir(nodePath.dirname(dst), {recursive: true});
                if (op.type === 'Copy'){
                    // Read-only sources are CAS objects; their mode must not
                    // leak into deploy trees (rsync -a would ship it), and a
                    // hardlink cannot carry its own mode, so copy those.
                    if (mode === 'link' && ((await fs.stat(op.src)).mode & 0o200) !== 0) {
                        await fs.link(op.src, dst);
                    } else {
                        await fs.copyFile(op.src, dst);
                        await fs.chmod(dst, 0o644);
                    }
                } else if (op.type === 'Write') {
                    await fs.writeFile(dst, op.data);
                } else if (op.type === 'Symlink') {
                    // A link and not the file it names, in every mode: what
                    // the tar carries is what a directory has to hold too.
                    // symlink() has no truncating open behind it, so the name
                    // is cleared first to keep a rerun over an existing tree
                    // working the way copy and write already do.
                    await fs.rm(dst, {force: true});
                    await fs.symlink(op.target, dst);
                }
                onFile?.();
            }
        } else {
            // In this case, I guess its a file rather than a dir.
            let out = createWriteStream(dir);
            (await this.pack(filter, onFile)).pipe(out);
            return new Promise<void>((resolve, reject) => {
                out.on('error', reject);
                out.on('finish', () => resolve());
            })
        }
    }

    // Entries are handed to the pack as fast as they can be read, but each
    // one's callback waits on the pack draining into whoever is reading it,
    // so `onFile` tracks what the consumer has taken rather than what has
    // been queued for it.
    async pack(filter?: (dst: string) => boolean, onFile?: () => void)
        : Promise<NodeJS.ReadableStream> {
        if (!this.valid)
            throw new Error(`Invalid ActionQueue`);
        let t = tar.pack();
        // An entry's callback also carries the error the consumer is already
        // reporting; count the entry only where it made it through.
        let took = onFile === undefined ? undefined : (err?: Error | null) => {
            if (err === null || err === undefined) {
                onFile();
            }
        };
        for (let entry of this.log) {
            if (entry.type !== 'Op' || (filter !== undefined && !filter(entry.dst)))
                continue;
            let op = entry.op;
            if (op.type === 'Symlink') {
                t.entry({name: entry.dst, type: 'symlink', linkname: op.target}, took)
                    .on('error', () => {});
                continue;
            }
            let data = op.type === 'Copy' ? await fs.readFile(op.src) : op.data;
            // A dying consumer destroys the pack and every pending entry
            // sink, and each sink emits the error; the consumer is the one
            // reporting the failure, so keep the sinks quiet.
            t.entry({name: entry.dst}, data, took).on('error', () => {});
        }
        // Without this the archive has no end-of-archive marker, and strict
        // readers (Python tarfile in stream mode) die on the truncation.
        t.finalize();
        return t;
    }
}
