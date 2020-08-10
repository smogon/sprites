
import fs from 'fs';
import nodePath from 'path';
import vm from 'vm';
import * as pathlib from './path.js';
import * as spritename from './spritename.js';

export class ActionQueue {
    private queue: {src : string, dst : string}[];
    
    constructor() {
        this.queue = [];
    }

    copy(src : string, dst : string) {
        // TODO: detect conflicts
        this.queue.push({src, dst});
    }

    describe() : {src : string, dst : string}[] {
        return this.queue;
    }

    join(dir : string) {
        for (const pair of this.queue) {
            pair.dst = nodePath.join(dir, pair.dst);
        }
    }

    print() {
        for (const {src, dst} of this.queue) {
            console.log(`${src} ==> ${dst}`);
        }
    }

    run(mode : 'link' | 'copy') {
        for (const {src, dst} of this.queue) {
            fs.mkdirSync(nodePath.dirname(dst), {recursive: true});
            if (mode === 'link') {
                fs.linkSync(src, dst);
            } else {
                fs.copyFileSync(src, dst);
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
        
        copy(src : pathlib.PathLike, dst : pathlib.PathLike) {
            const srcp = pathlib.path(src);
            const dstp = pathlib.path(dst);
            queue.copy(pathlib.format(pathlib.join(srcDir, srcp)), pathlib.format(dstp));
        }
    }
}

export function runOnFile(scr : Script, src : pathlib.Path) : pathlib.Path {
    const input = pathlib.update(src, {dir: ""});
    const result = scr.runInNewContext({
        __proto__: ENV_PROTO,
        path: input,
        ...input
    });
    if (result === undefined) {
        throw new Error(`undefined output on ${pathlib.format(src)}`);
    }
    const output = pathlib.path(input, result);
    return output;
}

export function run(scr : Script, srcDir : string, queue : ActionQueue) {
    scr.runInNewContext(makeEnv(srcDir, queue));
}
