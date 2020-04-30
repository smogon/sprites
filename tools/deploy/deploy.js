
import fs from 'fs';
import pathlib from 'path';

export function link(pairs, dstDir) {
    for (let {src, dst} of pairs) {
        dst = pathlib.join(dstDir, dst);
        fs.mkdirSync(pathlib.dirname(dst), {recursive: true});
        fs.linkSync(src, dst);
    }
}
