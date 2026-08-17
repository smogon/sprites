
import fs from 'fs';
import nodePath from 'path';
import tar from 'tar-stream';

type Op = {
    type: 'Write',
    data: string,
} | {
    type: 'Copy',
    src: string,
};

type OpEntry = {
    type: 'Op',
    op: Op,
    dst: string,
    valid: 'Success' | 'Absolute' | 'Multiple',
    debugObjs: unknown[]
};

type DebugEntry = {
    type: 'Debug',
    obj: unknown,
    stray: boolean
};

export type LogEntry = OpEntry | DebugEntry;

export class ActionQueue {
    private seen: Map<string, OpEntry | 'MoreThan1'>;
    // Have an accessor for this in the future? idk
    public log: LogEntry[];
    public valid: boolean;
    private debugBuffer: unknown[];

    constructor() {
        this.seen = new Map;
        this.log = [];
        this.valid = true;
        this.debugBuffer = [];
    }

    throw(obj: unknown) {
        this.gdebug(obj, false);
        this.valid = false;
    }

    debug(obj: unknown) {
        this.debugBuffer.push(obj);
    }

    gdebug(obj: unknown, stray: boolean) {
        this.log.push({type: 'Debug', obj, stray});
    }

    private pushOp(op: Op, dst: string) {
        dst = nodePath.normalize(dst);
        let entry: OpEntry = {
            type: 'Op',
            op,
            dst,
            valid: 'Success',
            debugObjs: this.debugBuffer
        };
        this.log.push(entry);
        this.debugBuffer = [];
        if (nodePath.isAbsolute(dst)) {
            this.valid = false;
            entry.valid = 'Absolute';
        } else {
            let lastEntry = this.seen.get(dst);
            if (lastEntry === undefined) {
                this.seen.set(dst, entry);
            } else {
                this.valid = false;
                entry.valid = 'Multiple';
                if (lastEntry !== 'MoreThan1') {
                    lastEntry.valid = 'Multiple';
                }
            }
        }
    }

    copy(src: string, dst: string) {
        this.pushOp({type: 'Copy', src}, dst);
    }

    write(data: string, dst: string) {
        this.pushOp({type: 'Write', data}, dst);
    }

    skip() {
        for (let obj of this.debugBuffer) {
            this.gdebug(obj, true);
        }
        this.debugBuffer = [];
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

    async run(dir: string, mode: 'link' | 'copy' | 'tar', filter?: (dst: string) => boolean) {
        if (!this.valid)
            throw new Error(`Invalid ActionQueue`);
        if (mode !== 'tar') {
            for (let entry of this.log) {
                if (entry.type !== 'Op' || (filter !== undefined && !filter(entry.dst)))
                    continue;
                let op = entry.op;
                let dst = nodePath.join(dir, entry.dst);
                fs.mkdirSync(nodePath.dirname(dst), {recursive: true});
                if (op.type === 'Copy'){
                    // Read-only sources are CAS objects; their mode must not
                    // leak into deploy trees (rsync -a would ship it), and a
                    // hardlink cannot carry its own mode, so copy those.
                    if (mode === 'link' && (fs.statSync(op.src).mode & 0o200) !== 0) {
                        fs.linkSync(op.src, dst);
                    } else {
                        fs.copyFileSync(op.src, dst);
                        fs.chmodSync(dst, 0o644);
                    }
                } else if (op.type === 'Write') {
                    fs.writeFileSync(dst, op.data);
                }
            }
        } else {
            // In this case, I guess its a file rather than a dir.
            let out = fs.createWriteStream(dir);
            this.pack(filter).pipe(out);
            return new Promise<void>((resolve, reject) => {
                out.on('error', reject);
                out.on('finish', () => resolve());
            })
        }
    }

    pack(filter?: (dst: string) => boolean): NodeJS.ReadableStream {
        if (!this.valid)
            throw new Error(`Invalid ActionQueue`);
        let t = tar.pack();
        for (let entry of this.log) {
            if (entry.type !== 'Op' || (filter !== undefined && !filter(entry.dst)))
                continue;
            let op = entry.op;
            let data = op.type === 'Copy' ? fs.readFileSync(op.src) : op.data;
            // A dying consumer destroys the pack and every pending entry
            // sink, and each sink emits the error; the consumer is the one
            // reporting the failure, so keep the sinks quiet.
            t.entry({name: entry.dst}, data).on('error', () => {});
        }
        // Without this the archive has no end-of-archive marker, and strict
        // readers (Python tarfile in stream mode) die on the truncation.
        t.finalize();
        return t;
    }
}
