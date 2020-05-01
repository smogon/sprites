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

asTmp("deflopt", src, dst => {
    const {processed, rewritten} = deflopt(exe, dst);
    if (processed !== 1) {
        throw new Error(`Didn't process any files.`);
    }
    return {changed: rewritten > 0};
});
