
import fs from 'fs';
import pathlib from 'path';

export function find(startDir : string, tag : string) {
    const stack = [startDir];
    const results = [];
    let dir;
    while (dir = stack.pop()) {
        for (const name of fs.readdirSync(dir)) {
            const path = pathlib.join(dir, name);
            if (fs.lstatSync(path).isDirectory()) {
                stack.push(path);
            } else if (name === `${tag}.deploy.js`) {
                results.push(path);
            }
        }
    }
    return results;
}
