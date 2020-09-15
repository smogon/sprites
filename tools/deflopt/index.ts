// Run DeflOpt.exe.
// Wine and Tup's fuse filesystem don't play nicely together.
// Copy inputs to /tmp first.

import {asTmp} from './tmp.js';
import {deflopt} from './deflopt.js';

const exe = process.argv[2];
const src = process.argv[3];
if (src === undefined || exe === undefined) {
    throw new Error('tools/deflopt <path to DeflOpt.exe> <file>');
}

const ret = asTmp("deflopt", src, (dst : string) => {
    const {processed, rewritten} = deflopt(exe, dst);
    return {changed: rewritten > 0, ret : processed === 1};
});

if (!ret) {
    console.error(`Didn't process any files.`);
    process.exit(1);
}
