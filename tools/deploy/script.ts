
import fs from 'fs';
import nodePath from 'path';
import vm from 'vm';
import * as pathlib from './path.js';

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

class Env {
    constructor(private srcDir : string,
                private dstDir : string,
                private queue : ActionQueue) {}
    
    list(dir : string) : pathlib.Path[] {
        const result = [];
        for (const filename of fs.readdirSync(nodePath.join(this.srcDir, dir))) {
            result.push(pathlib.path(filename, {dir}));
        }
        return result;
    }

    copy(src : pathlib.PathLike, dst : pathlib.PathLike) {
        const srcp = pathlib.path(src);
        const dstp = pathlib.path(dst);
        this.queue.copy(pathlib.join(this.srcDir, srcp), pathlib.join(this.dstDir, dstp));
    }
}

export class Script {
    private script : vm.Script;
    
    constructor(code : string) {
        this.script = new vm.Script(code);
    }

    runOnFile(p : pathlib.Path) : any {
        return this.script.runInNewContext({path: p, ...p});
    }

    run(srcDir : string, dstDir : string, queue : ActionQueue) {
        this.script.runInNewContext(new Env(srcDir, dstDir, queue));
    }
}

