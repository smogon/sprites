
import fs from 'fs';
import pathlib from 'path';

export function link(pairs : {src : string, dst : string}[], dstDir : string, mode : 'link' | 'copy') {
    for (let {src, dst} of pairs) {
        dst = pathlib.join(dstDir, dst);
        fs.mkdirSync(pathlib.dirname(dst), {recursive: true});
        if (mode === 'link') {
            fs.linkSync(src, dst);
        } else {
            fs.copyFileSync(src, dst);
        }
    }
}
