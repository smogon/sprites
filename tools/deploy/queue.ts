
import * as fs from 'node:fs/promises';
import * as nodePath from 'node:path';

import {BuildError} from '../build/errors.ts';

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

// The output root a publish keeps out of the served tree.
export let META = '__meta';

export type Published = {
    files: number,
    placed: number,
    kept: number,
};

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

// The path under META, or null for a dst outside it.
function metaRest(dst: string): string | null {
    if (dst === META) {
        return '';
    }
    return dst.startsWith(`${META}/`) ? dst.slice(META.length + 1) : null;
}

// Write-then-rename: a served name is cached forever, so nothing may ever
// read it half written.
async function place(dst: string, write: (tmp: string) => Promise<void>): Promise<void> {
    await fs.mkdir(nodePath.dirname(dst), {recursive: true});
    let tmp = nodePath.join(nodePath.dirname(dst),
        `.${nodePath.basename(dst)}.${process.pid}.${Math.random().toString(36).slice(2)}`);
    try {
        await write(tmp);
        await fs.rename(tmp, dst);
    } catch (err) {
        await fs.rm(tmp, {force: true});
        throw err;
    }
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
        } else if (dst === '..' || dst.startsWith('../')) {
            this.valid = false;
            entry.valid = 'Escapes';
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

    // A link's target may only name something else in this tree.
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

    #ops(): OpEntry[] {
        if (!this.valid)
            throw new Error(`Invalid ActionQueue`);
        return this.log.filter(entry => entry.type === 'Op');
    }

    async run(dir: string, mode: 'link' | 'copy', filter?: (dst: string) => boolean) {
        for (let entry of this.#ops()) {
            if (filter !== undefined && !filter(entry.dst))
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
                // symlink() has no truncating open behind it, so the name
                // is cleared first to keep a rerun over an existing tree
                // working the way copy and write already do.
                await fs.rm(dst, {force: true});
                await fs.symlink(op.target, dst);
            }
        }
    }

    // Into a served tree and the directory beside it holding what isn't
    // served. The tree is add-only: every name in it carries a content hash
    // and is cached forever, so a name already there is the same file and is
    // touched, and one there at another size is refused. `meta` is this
    // publish's own and is written whole; it gets `__files`, the tree names
    // this publish stands behind, and `__digest`, the caller's digest of
    // everything published.
    async publish(tree: string, meta: string, digest: string): Promise<Published> {
        let ops = this.#ops();
        let dsts = new Set(ops.map(entry => entry.dst));
        let files: string[] = [];
        let placed = 0;
        let kept = 0;

        let landed = (dst: string): string => {
            let rest = metaRest(dst);
            return rest === null ? nodePath.join(tree, dst) : nodePath.join(meta, rest);
        };

        for (let entry of ops) {
            let rest = metaRest(entry.dst);
            if (rest === '' || rest?.split('/').some(part => part.startsWith('__'))) {
                throw new BuildError(`${META} names starting with __ are the publish's own: ${entry.dst}`);
            }
            if (entry.op.type === 'Symlink') {
                if (rest === null) {
                    throw new BuildError(`A served tree holds files, not links: ${entry.dst}`);
                }
                // The validity check already settled that it resolves.
                let target = resolveLink(entry.dst, entry.op.target)!;
                if (!dsts.has(target)) {
                    throw new BuildError(`A link to something this publish doesn't carry: ${entry.dst} -> ${target}`);
                }
                let dst = landed(entry.dst);
                await fs.mkdir(nodePath.dirname(dst), {recursive: true});
                await fs.rm(dst, {force: true});
                await fs.symlink(nodePath.relative(nodePath.dirname(dst), landed(target)), dst);
                continue;
            }
            let op = entry.op;
            let dst = landed(entry.dst);
            if (rest !== null) {
                await fs.mkdir(nodePath.dirname(dst), {recursive: true});
                if (op.type === 'Copy') {
                    await fs.copyFile(op.src, dst);
                    await fs.chmod(dst, 0o644);
                } else {
                    await fs.writeFile(dst, op.data);
                }
                continue;
            }
            files.push(entry.dst);
            let size = op.type === 'Copy' ? (await fs.stat(op.src)).size : Buffer.byteLength(op.data);
            let have = await fs.stat(dst).catch((err: NodeJS.ErrnoException) => {
                if (err.code === 'ENOENT') {
                    return null;
                }
                throw err;
            });
            if (have !== null) {
                if (have.size !== size) {
                    throw new BuildError(`Different file size: ${entry.dst} is already in the tree holding `
                        + `something else, and a name in there is served as if it can never change.`);
                }
                let now = new Date();
                await fs.utimes(dst, now, now);
                kept++;
                continue;
            }
            if (op.type === 'Copy') {
                // A CAS object is read-only and never changes, so the tree can
                // share it; a source file is copied, since the checkout it
                // sits in moves on.
                let src = op.src;
                let linked = false;
                if (((await fs.stat(src)).mode & 0o200) === 0) {
                    await fs.mkdir(nodePath.dirname(dst), {recursive: true});
                    try {
                        await fs.link(src, dst);
                        linked = true;
                    } catch (err) {
                        // Another filesystem: a copy, like a source
                        if ((err as NodeJS.ErrnoException).code !== 'EXDEV') {
                            throw err;
                        }
                    }
                }
                if (!linked) {
                    await place(dst, async tmp => {
                        await fs.copyFile(src, tmp);
                        await fs.chmod(tmp, 0o644);
                    });
                }
            } else {
                let data = op.data;
                await place(dst, tmp => fs.writeFile(tmp, data, {mode: 0o644}));
            }
            placed++;
        }

        await fs.mkdir(meta, {recursive: true});
        await fs.writeFile(nodePath.join(meta, '__files'), files.sort().map(f => `${f}\n`).join(''));
        await fs.writeFile(nodePath.join(meta, '__digest'), `${digest}\n`);
        return {files: files.length, placed, kept};
    }
}
