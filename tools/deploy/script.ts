
import fs from 'fs';
import nodePath from 'path';
import vm from 'vm';
import * as pathlib from './path.js';
import * as spritedata from '@smogon/sprite-data';


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

    throw(obj : Error) {
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
                    console.log("DEBUG:", obj);
                }
                if (op.type === 'Copy') {
                    console.log(`COPY${addendum}: ${op.src} ==> ${entry.dst}`);
                } else if (op.type === 'Write') {
                    console.log(`WRITE${addendum}: ${op.data.length} characters ==> ${entry.dst}`);
                }
            } else if (entry.type === 'Debug') {
                let addendum = '';
                if (entry.stray) {
                    addendum = ` (stray)`;
                }
                console.log(`GDEBUG${addendum}:`, entry.obj);
            }
        }
    }

    run(dir : string, mode : 'link' | 'copy') {
        if (!this.valid)
            throw new Error(`Invalid ActionQueue`);
        for (const entry of this.log) {
            if (entry.type === 'Op') {
                const op = entry.op;
                const dst = nodePath.join(dir, entry.dst);
                fs.mkdirSync(nodePath.dirname(dst), {recursive: true});
                if (op.type === 'Copy'){
                    if (mode === 'link') {
                        fs.linkSync(op.src, dst);
                    } else {
                        fs.copyFileSync(op.src, dst);
                    }
                } else if (op.type === 'Write') {
                    fs.writeFileSync(dst, op.data);
                }
            }
        }
    }
}

export class Script extends vm.Script {
    public readonly filename : string | null;

    constructor(x : string, type : 'file' | 'expr') {
        let code : string;
        let filename : string | null = null;
        if (type === 'expr') {
            // Force expression parsing
            code = `(${x})`;
        } else {
            code = fs.readFileSync(x, 'utf8');
            filename = x;
        }
        super(code, filename !== null ? {filename} : undefined);
        this.filename = filename;
    }
}

const SKIP = {};

const ENV0 = {
    spritedata,
    SKIP,
    // Because throw SKIP isn't an expression
    skip() {
        throw SKIP;
    }
};

function makeEnv1(queue: ActionQueue) {
    return {
        __proto__: ENV0,
        debug(obj : unknown) {
            queue.debug(obj);
        },
        
        gdebug(obj : unknown) {
            queue.gdebug(obj, false);
        }
    }
};

function makeEnv2(srcDir : string, queue: ActionQueue) {
    return {
        __proto__: makeEnv1(queue),
        
        list(dir : string) : pathlib.Path[] {
            const result = [];
            for (const filename of fs.readdirSync(nodePath.join(srcDir, dir))) {
                result.push(pathlib.path(filename, {dir}));
            }
            return result;
        },
        
        copy(srcp : pathlib.PathLike, dstp : string | pathlib.Delta /* todo deltalike */) {
            const src = pathlib.format(pathlib.path(srcp));
            let dst : string;
            if (typeof dstp === 'string') {
                dst = dstp;
            } else {
                dst = pathlib.format(pathlib.path(srcp, dstp));
            }
            queue.copy(nodePath.join(srcDir, src), dst);
        },

        read(srcp : pathlib.PathLike) : string {
            const src = pathlib.format(pathlib.path(srcp));
            return fs.readFileSync(nodePath.join(srcDir, src), 'utf8');
        },

        write(dstp : pathlib.PathLike, data : string) {
            const dst = pathlib.format(pathlib.path(dstp));
            queue.write(data, dst);
        }
    }
}

export function runOnFile(scr : Script, src : string, queue: ActionQueue) {
    try {
        const input = pathlib.path(src, {dir: ""});
        const result = scr.runInNewContext({
            __proto__: makeEnv1(queue),
            path: input,
            ...input
        });
        if (result === undefined) {
            throw new Error(`undefined output on ${src}`);
        }
        const output = pathlib.update(input, result);
        const dst = pathlib.format(output);
        queue.copy(src, dst);
    } catch(e) {
        if (e === SKIP) {
            queue.skip();
            return;
        }
        queue.throw(e);
    }
}

export function run(scr : Script, srcDir : string, queue : ActionQueue) {
    try {
        scr.runInNewContext(makeEnv2(srcDir, queue));
    } catch(e) {
        if (e === SKIP) {
            queue.skip();
            return;
        }
        queue.throw(e);
    }
}
