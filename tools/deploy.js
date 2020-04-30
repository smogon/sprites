
const fs = require('fs');
const pathlib = require('path');

const srcDir = process.argv[2];
const dstDir = process.argv[3];
if (srcDir === undefined || dstDir === undefined) {
    throw new Error("Pass in directory to search for deploy scripts & directory to deploy to.");
}

process.chdir(srcDir);

const stack = ["."];
const deployMap = new Map;
let dir;
while (dir = stack.pop()) {
    for (const name of fs.readdirSync(dir)) {
        const path = pathlib.join(dir, name);
        if (fs.statSync(path).isDirectory()) {
            stack.push(path);
        } else if (name === 'deploy.json' || name.endsWith('.deploy.json')) {
            console.log(`Found ${path}`);
            const pairs = JSON.parse(fs.readFileSync(path, 'utf8'));
            for (let {sel: src, as: dst} of pairs) {
                src = pathlib.normalize(src);
                dst = pathlib.normalize(dst);

                if (pathlib.isAbsolute(src)) {
                    throw new Error('Deploy files are always relative to deploy json');
                }
                src = pathlib.join(dir, src);

                if (pathlib.isAbsolute(dst)) {
                    throw new Error('Deploy files are always relative to destination directory');
                }
                dst = pathlib.join(dstDir, dst);

                if (deployMap.has(dst)) {
                    throw new Error(`Duplicate deploy for ${dst}`);
                }

                deployMap.set(dst, src);
            }
        }
    }
}

for (const [dst, src] of deployMap) {
    fs.mkdirSync(pathlib.dirname(dst), {recursive: true});
    fs.linkSync(src, dst);
}
