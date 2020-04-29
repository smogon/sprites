
const fs = require('fs');
const pathlib = require('path');

process.argv.splice(0, 2);

if (process.argv.length < 3) {
    throw new Error("Must provide at least one directory/file to generate a deployment script for,  a destination directory, and a deploy json file.");
}

const deployFile = process.argv.pop();
const baseDir = pathlib.dirname(deployFile);
const dstDir = process.argv.pop();
const srcs = process.argv;

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

const deployMap = new Map;

function addFile(path) {
    const parsed = pathlib.parse(path);
    const newName = toPSSpriteID(decode(parsed.name)) + parsed.ext;
    const srcPath = pathlib.relative(baseDir, path);
    const dstPath = pathlib.join(dstDir, newName);
    if (deployMap.has(dstPath)) {
        throw new Error(`Already an entry for ${dstPath}`);
    }
    deployMap.set(dstPath, srcPath);
}

for (const src of srcs) {
    if (fs.statSync(src).isDirectory()) {
        for (const name of fs.readdirSync(src)) {
            addFile(pathlib.join(src, name));
        }
    } else {
        addFile(src);
    }
}

const output = [];
for (const [dst, src] of deployMap) {
    output.push([src, dst]);
}

fs.mkdirSync(baseDir, {recursive: true});
fs.writeFileSync(deployFile, JSON.stringify(output, null, '  '));
