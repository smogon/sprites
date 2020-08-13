
import fs from 'fs';
import nodePath from 'path';
import vm from 'vm';
import * as pathlib from './path.js';
import * as spritename from './spritename.js';

export class ActionQueue {
    private map: Map<string, string>;
    
    constructor() {
        this.map = new Map;
    }

    copy(src : string, dst : string) {
        // TODO: detect conflicts
        dst = nodePath.normalize(dst);
        if (nodePath.isAbsolute(dst)) {
            throw new Error(`destination ${dst} is absolute`);
        }
        const result = this.map.get(dst);
        if (result !== undefined) {
            throw new Error(`already copying ${result} to ${dst}`);
        }
        this.map.set(dst, src);
    }

    describe(dir : string) : {src : string, dst : string}[] {
        const result = [];
        for (const [dst, src] of this.map) {
            result.push({src,dst: nodePath.join(dir, dst)});
        }
        return result;
    }

    print(dir : string) {
        for (const {src, dst} of this.describe(dir)) {
            console.log(`${src} ==> ${dst}`);
        }
    }

    run(dir : string, mode : 'link' | 'copy') {
        for (const {src, dst} of this.describe(dir)) {
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
