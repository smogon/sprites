
import fs from 'fs';
import nodePath from 'path';
import vm from 'vm';
import * as pathlib from './path.js';
import * as spritename from './spritename.js';

type CopyEntry = {
    type : 'Copy',
    src : string,
    dst : string,
    valid : 'Success' | 'Absolute' | 'Multiple'
};

export type LogEntry = CopyEntry | {
    type : 'Debug',
    obj : any
};

export class ActionQueue {
    private seen : Map<string, CopyEntry | 'MoreThan1'>;
    // Have an accessor for this in the future? idk
    public log : LogEntry[];
    public valid : boolean;
    
    constructor() {
        this.seen = new Map;
        this.log = [];
        this.valid = true;
    }

    debug(obj : any) {
        this.log.push(obj);
    }

    copy(src : string, dst : string) {
        dst = nodePath.normalize(dst);
        const entry : CopyEntry = {
            type : 'Copy',
            src,
            dst,
            valid : 'Success'
        };
        this.log.push(entry);
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
    
    print() {
        for (const entry of this.log) {
            if (entry.type === 'Copy') {
                let addendum = '';
                if (entry.valid !== 'Success') {
                    addendum = ` (${entry.valid})`;
                }
                console.log(`${entry.src} ==> ${entry.dst}${addendum}`);
            } else if (entry.type === 'Debug') {
                console.log("DEBUG: ", entry.obj);
            }
        }
    }

    run(dir : string, mode : 'link' | 'copy') {
        if (!this.valid)
            throw new Error(`Invalid ActionQueue`);
        for (const entry of this.log) {
            if (entry.type === 'Copy') {
                let {src, dst} = entry;
                dst = nodePath.join(dir, dst);
                fs.mkdirSync(nodePath.dirname(dst), {recursive: true});
                if (mode === 'link') {
                    fs.linkSync(src, dst);
                } else {
                    fs.copyFileSync(src, dst);
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

const ENV_PROTO = {
    spritename
};

function makeEnv(srcDir : string, queue: ActionQueue) {
    return {
        __proto__: ENV_PROTO,
        
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

        debug(obj : any) {
            queue.debug(obj);
        }
    }
}

export function runOnFile(scr : Script, src : string) : string {
    const input = pathlib.path(src, {dir: ""});
    const result = scr.runInNewContext({
        __proto__: ENV_PROTO,
        path: input,
        ...input
    });
    if (result === undefined) {
        throw new Error(`undefined output on ${src}`);
    }
    const output = pathlib.update(input, result);
    const dst = pathlib.format(output);
    return dst;
}

export function run(scr : Script, srcDir : string, queue : ActionQueue) {
    scr.runInNewContext(makeEnv(srcDir, queue));
}
