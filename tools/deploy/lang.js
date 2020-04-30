
import pathlib from 'path';
import fs from 'fs';
import * as util from './util.js';
import JSON5 from 'json5';
import debugfn from 'debug';

const debug = debugfn('deploy');

/*
  Language:
  e = {"src": "<file|dir>", "dst"?: "<file>", "recursive"?: true}
    | {"chdir": "<dir>", "in": e}
    | ("mount": "<dir>", "in": e)
    | {"psSpriteId": e}
    | {"smogonId": e}
    | {"replace": "<regex>", "with": "<pattern>", "in": e} 
    | {"bias": e}  # Collapse bias left-to-right
    | {"merge": e}  
    | [e]       (shorthand for merge)
    | <string>  (shorthand for sel)

  "Primitive form" is just
    [{"src": "<file>", "dst": "<new filename>"}]
 */

function mapDst(list, f) {
    return list.map(({src, dst}) => ({src, dst: f(dst)}));
}

function interpret(curDir, e) {
    if (Array.isArray(e)) {
        e = {merge: e};
    } else if (typeof e === 'string') {
        e = {src: e};
    }

    if (e.src) {
        if (pathlib.isAbsolute(e.src)) {
            throw new Error(`Absolute source: ${e.src}`);
        }
        
        const path = pathlib.join(curDir, e.src);
        const results = [];
        
        // TODO implement recursive
        if (fs.statSync(path).isDirectory()) {
            for (const name of fs.readdirSync(path)) {
                results.push({src: pathlib.join(path, name), dst: name});
            }
        } else {
            results.push({src: path, dst: e.dst !== undefined ? e.dst : pathlib.baseName(path)});
        }

        return results;
    } else if (e.merge) {
        const results = [];
        for (const e2 of e.merge) {
            results.push(...interpret(curDir, e2));
        }
        return results;
    } else if (e.chdir) {
        return interpret(pathlib.join(curDir, e.chdir), e.in);
    } else if (e.mount) {
        return mapDst(interpret(curDir, e.in), dst => pathlib.join(e.mount, dst));
    } else if (e.psSpriteId) {
        return mapDst(interpret(curDir, e.psSpriteId), dst => {
            const parsed = pathlib.parse(dst);
            delete parsed.base;
            parsed.name = util.toPSSpriteID(util.decode(parsed.name));
            return pathlib.format(parsed);
        });
    } else if (e.smogonId) {
        return mapDst(interpret(curDir, e.smogonId), dst => {
            const parsed = pathlib.parse(dst);
            delete parsed.base;
            parsed.name = util.toSmogonID(util.decode(parsed.name));
            return pathlib.format(parsed);
        });
    } else if (e.replace) {
        const re = new RegExp(e.replace);
        return mapDst(interpret(curDir, e.in), dst => dst.replace(re, e.with));
    } else if (e.bias) {
        return Array.from(new Set(interpret(curDir, e)));
    } else {
        throw new Error(`Can't interpret (top-level keys of object: ${Object.keys(e)})`);
    }
}

export function run(files) {
    const results = [];
    for (const file of files) {
        const contents = fs.readFileSync(file, 'utf8');
        const curDir = pathlib.dirname(file);
        const e = JSON5.parse(contents);
        debug(`Processing ${file}`);
        results.push(...interpret(curDir, e));
    }
    const seen = new Set;
    for (const {dst} of results) {
        if (pathlib.isAbsolute(dst)) {
            throw new Error(`Absolute destination: ${dst}`);
        }
        
        if (seen.has(dst)) {
            throw new Error(`Duplicate output for ${dst}`);
        }
        
        seen.add(dst);
    }
    return results;
}