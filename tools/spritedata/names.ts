import {formatFilename} from '@smogon/sprite-data/index.ts';

import {spriteFiles} from './pokedex.ts';

// Every sprite filename pokemon-showdown implies, one per line:
//
//   node tools/spritedata/names.ts ~/smogon/pokemon-showdown | sort > /tmp/want
//   ls src/models | sed 's/\.[^.]*$//' | cut -d- -f1 | sort -u > /tmp/have
//
// Nothing in the build validates a filename any more, so this is how you check
// a directory against the source of truth.

let ps = process.argv[2];
if (!ps) {
    throw new Error('usage: node tools/spritedata/names.ts <pokemon-showdown checkout>');
}

for (let file of spriteFiles(ps)) {
    process.stdout.write(`${formatFilename(file)}\n`);
}
