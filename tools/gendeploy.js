
const fs = require('fs');
const pathlib = require('path');

process.argv.splice(0, 2);

const dstFile = process.argv.pop();
const srcFile = process.argv.pop();
if (srcFile === undefined || dstFile === undefined) {
    throw new Error(`gendeploy <src> <dst>`);
}

const baseDir = pathlib.dirname(dstFile);

function decode(s) {
    return s.replace(/__(....)/g, (_, m) => String.fromCharCode(parseInt(m, 16))).replace("_", " ");
}

function decomposeName(name) {
    const [base,forme=null] = name.split("--");
    return {base, forme};
}

function toPSID(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function toPSSpriteID(name) {
    const info = decomposeName(name);
    let result = toPSID(info.base);
    if (info.forme !== null) {
        if (info.forme === 'Female') {
            info.forme = 'F';
        }
        result += '-' + toPSID(info.forme);
    }
    return result;
}

function toSmogonID(name) {
    return name.toLowerCase().replace("--", "-").replace(/[ _]+/, "-").replace(/[^a-z0-9-]+/g, '');
}

/*
  Language:
  e = {"sel": "<file|dir>", "as"?: "<file>", "recursive"?: true}
    | {"chdir": "<dir>", "in": e}
    | ("dest": "<dir>", "in": e)
    | {"psSpriteId": e}
    | {"smogonId": e}
    | {"replace": "<regex>", "with": "<pattern>", "in": e} 
    | {"bias": e}  # Collapse bias left-to-right
    | {"merge": e}  
    | [e]       (shorthand for merge)
    | <string>  (shorthand for sel)

  "Primitive form" is just
    [{"sel": "<file>", "as": "<new filename>"}]
 */

function interpret(curDir, e) {
    if (Array.isArray(e)) {
        e = {merge: e};
    } else if (typeof e === 'string') {
        e = {sel: e};
    }

    if (e.sel) {
        const path = pathlib.join(curDir, e.sel);
        const result = [];
        // TODO implement recursive
        if (fs.statSync(path).isDirectory()) {
            for (const name of fs.readdirSync(path)) {
                result.push([pathlib.relative(baseDir, pathlib.join(path, name)), name]);
            }
        } else {
            result.push([pathlib.relative(baseDir, path), e.as !== undefined ? e.as : pathlib.baseName(e.sel)]);
        }
        return result;
    } else if (e.merge) {
        const result = [];
        for (const e2 of e.merge) {
            result.push(...interpret(curDir, e2));
        }
        return result;
    } else if (e.chdir) {
        return interpret(pathlib.join(curDir, e.chdir), e.in);
    } else if (e.dest) {
        return interpret(curDir, e.in).map(([src, dst]) => [src, pathlib.join(e.dest, dst)]);
    } else if (e.psSpriteId) {
        return interpret(curDir, e.psSpriteId).map(([src, dst]) => {
            const parsed = pathlib.parse(dst);
            delete parsed.base;
            parsed.name = toPSSpriteID(decode(parsed.name));
            return [src, pathlib.format(parsed)];
        });
    } else if (e.smogonId) {
        return interpret(curDir, e.smogonId).map(([src, dst]) => {
            const parsed = pathlib.parse(dst);
            delete parsed.base;
            parsed.name = toSmogonID(decode(parsed.name));
            return [src, pathlib.format(parsed)];
        });
    } else if (e.replace) {
        const re = new RegExp(e.replace);
        return interpret(curDir, e.in).map(([src, dst]) => {
            return [src, dst.replace(re, e.with)];
        });
    } else if (e.bias) {
        return Array.from(new Set(interpret(curDir, e)));
    } else {
        throw new Error(`Can't interpret`);
    }
}

const e = JSON.parse(fs.readFileSync(srcFile)); ;
const output = [];
const seen = new Set;
for (const [src, dst] of interpret(".", e)) {
    if (seen.has(dst)) {
        throw new Error(`Already an entry for ${dst}`);
    }
    output.push({sel: src, as: dst});
}

fs.mkdirSync(baseDir, {recursive: true});
fs.writeFileSync(dstFile, JSON.stringify(output, null, '  '));
