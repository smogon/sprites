
import fs from 'fs';
import nodePath from 'path';
import tar from 'tar-stream';

type Op = {
    type : 'Write',
    data : string,
} | {
    type : 'Copy',
    src : string,
};

type OpEntry = {
    type : 'Op',
    op : Op,
    dst : string,
    valid : 'Success' | 'Absolute' | 'Multiple',
    debugObjs : unknown[]
};

type DebugEntry = {
    type : 'Debug',
    obj : unknown,
    stray : boolean
};

export type LogEntry = OpEntry | DebugEntry;

export class ActionQueue {
    private seen : Map<string, OpEntry | 'MoreThan1'>;
    // Have an accessor for this in the future? idk
    public log : LogEntry[];
    public valid : boolean;
    private debugBuffer : unknown[];

    constructor() {
        this.seen = new Map;
        this.log = [];
        this.valid = true;
        this.debugBuffer = [];
    }

    throw(obj : unknown) {
        this.gdebug(obj, false);
        this.valid = false;
    }

    debug(obj : unknown) {
        this.debugBuffer.push(obj);
    }

    gdebug(obj : unknown, stray : boolean) {
        this.log.push({type: 'Debug', obj, stray});
    }

    private pushOp(op: Op, dst : string) {
        dst = nodePath.normalize(dst);
        const entry : OpEntry = {
            type : 'Op',
            op,
            dst,
            valid : 'Success',
            debugObjs : this.debugBuffer
        };
        this.log.push(entry);
        this.debugBuffer = [];
        if (nodePath.isAbsolute(dst)) {
            this.valid = false;
            entry.valid = 'Absolute';
        } else {
            const lastEntry = this.seen.get(dst);
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

    copy(src : string, dst : string) {
        this.pushOp({type: 'Copy', src}, dst);
    }

    write(data : string, dst : string) {
        this.pushOp({type: 'Write', data}, dst);
    }

    skip() {
        for (const obj of this.debugBuffer) {
            this.gdebug(obj, true);
        }
        this.debugBuffer = [];
    }

    print(level : 'errors' | 'all') {
        for (const entry of this.log) {
            if (entry.type === 'Op') {
                const op = entry.op;
                if (entry.valid === 'Success' && level === 'errors')
                    continue;
                let addendum = '';
                if (entry.valid !== 'Success') {
                    addendum = ` (${entry.valid})`;
                }
                for (const obj of entry.debugObjs) {
                    console.error("DEBUG:", obj);
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

    async run(dir : string, mode : 'link' | 'copy' | 'tar') {
        if (!this.valid)
            throw new Error(`Invalid ActionQueue`);
        if (mode !== 'tar') {
            for (const entry of this.log) {
                if (entry.type !== 'Op')
                    continue;
                const op = entry.op;
                const dst = nodePath.join(dir, entry.dst);
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
            const out = fs.createWriteStream(dir);
            this.pack().pipe(out);
            return new Promise<void>((resolve, reject) => {
                out.on('error', reject);
                out.on('finish', () => resolve());
            })
        }
    }

    pack(filter? : (dst : string) => boolean) : NodeJS.ReadableStream {
        if (!this.valid)
            throw new Error(`Invalid ActionQueue`);
        let t = tar.pack();
        for (const entry of this.log) {
            if (entry.type !== 'Op' || (filter !== undefined && !filter(entry.dst)))
                continue;
            const op = entry.op;
            if (op.type === 'Copy'){
                t.entry({name: entry.dst}, fs.readFileSync(op.src));
            } else if (op.type === 'Write') {
                t.entry({name: entry.dst}, op.data);
            }
        }
        // Without this the archive has no end-of-archive marker, and strict
        // readers (Python tarfile in stream mode) die on the truncation.
        t.finalize();
        return t;
    }
}
