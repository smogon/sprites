
import pathlib from 'path';
import fs from 'fs';
import * as util from './util.js';
import debugfn from 'debug';
import vm from 'vm';

const debug = debugfn('deploy');

let STATE;

function resetState(srcDir, map) {
    STATE = {
        dstDir: ".",
        srcDir,
        transform: (dst) => dst,
        map,
        allowOverwrite: false
    };
};

function addPair(src, dst) {
    dst = STATE.transform(dst);
    
    if (pathlib.isAbsolute(dst)) {
        throw new Error(`Absolute destination: ${dst}`);
    }

    dst = pathlib.join(STATE.destDir, dst);

    if (STATE.map.has(dst) && !STATE.allowOverwrite) {
        throw new Error(`Duplicate entry: ${dst}`);
    }

    STATE.map.set(dst, src);
}

const ENV = {
    toPSSpriteID(dst) {
        const parsed = pathlib.parse(dst);
        delete parsed.base;
        parsed.name = util.toPSSpriteID(util.decode(parsed.name));
        return pathlib.format(parsed);
    },

    toSmogonAlias(dst) {
        const parsed = pathlib.parse(dst);
        delete parsed.base;
        parsed.name = util.toSmogonAlias(util.decode(parsed.name));
        return pathlib.format(parsed);
    },
    
    transform(f, body) {
        const oldTransform = STATE.transform;
        STATE.transform = f;
        body();
        STATE.transform = oldTransform;
    },

    overwrite(body) {
        if (STATE.allowOverwrite) {
            throw new Error("Already in overwrite mode");
        }
        STATE.allowOverwrite = true;
        body();
        STATE.allowOverwrite = false;
    },

    dest(path) {
        STATE.destDir = path;
    },

    sel(...srcs) {
        for (const src of srcs) {
            if (pathlib.isAbsolute(src)) {
                throw new Error(`Absolute source: ${src}`);
            }
            
            const path = pathlib.join(STATE.srcDir, src);

            if (fs.statSync(path).isDirectory()) {
                for (const name of fs.readdirSync(path)) {
                    addPair(pathlib.join(path, name), name);
                }
            } else {
                addPair(path, pathlib.basename(path));
            }
        }
    }
}

function run1(file, map) {
    const contents = fs.readFileSync(file, 'utf8');
    const curDir = pathlib.dirname(file);
    resetState(curDir, map);
    debug(`Processing ${file}`);
    vm.runInNewContext(contents, ENV);
}

export function run(files) {
    const map = new Map;
    for (const file of files) {
        run1(file, map);
    }
    const results = [];
    for (const [dst, src] of map) {
        results.push({src, dst});
    }
    return results;
}
