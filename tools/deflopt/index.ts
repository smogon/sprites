
import {deflopt} from './deflopt.js';

const src = process.argv[2];
if (src === undefined) {
    throw new Error('tools/deflopt <file>');
}

const {processed, rewritten} = deflopt(src);

if (processed !== 1) {
    console.error(`Didn't process any files.`);
    process.exit(1);
}
