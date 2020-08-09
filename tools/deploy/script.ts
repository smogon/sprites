
import fs from 'fs';
import nodePath from 'path';
import vm from 'vm';
import * as pathlib from './path.js';
import * as spritename from './spritename.js';

export class ActionQueue {
    private queue: {src : pathlib.Path, dst : pathlib.Path}[];
    
    constructor() {
        this.queue = [];
    }

    copy(src : pathlib.Path, dst : pathlib.Path) {
        // TODO: detect conflicts
        this.queue.push({src, dst});
    }

    describe() : {src : pathlib.Path, dst : pathlib.Path}[] {
        return this.queue;
    }

    print() {
        for (const {src, dst} of this.queue) {
            console.log(`${pathlib.format(src)} ==> ${pathlib.format(dst)}`);
        } 
    }

    run(mode : 'link' | 'copy') {
        for (const {src, dst} of this.queue) {
            fs.mkdirSync(dst.dir, {recursive: true});
            if (mode === 'link') {
                fs.linkSync(pathlib.format(src), pathlib.format(dst));
            } else {
                fs.copyFileSync(pathlib.format(src), pathlib.format(dst));
            }
        }
    }
}

const ENV_PROTO = {
    spritename
};

function makeEnv(srcDir : string, dstDir : string, queue: ActionQueue) {
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
            queue.copy(pathlib.join(srcDir, srcp), pathlib.join(dstDir, dstp));
        }
    }
}

export class Script {
    private script : vm.Script;
    
    constructor(code : string) {
        this.script = new vm.Script(code);
    }

    runOnFile(src : pathlib.Path) : pathlib.Path {
        const input = pathlib.update(src, {dir: ""});
        const result = this.script.runInNewContext({
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

    run(srcDir : string, dstDir : string, queue : ActionQueue) {
        this.script.runInNewContext(makeEnv(srcDir, dstDir, queue));
    }
}

