import {createRequire} from 'node:module';
import * as path from 'node:path';

// Regenerates data/items.json from a pokemon-showdown checkout:
//
//   node tools/spritedata/items.ts ~/smogon/pokemon-showdown > data/items.json
//
// One sprite per item number, so items that share a number share a sprite and
// collect their names in one entry: Aspear Berry is also Burnt Berry.

type ItemEntry = {
    type: 'item',
    names: string[],
    sid: string
};

type ItemsEntry = {
    num: number,
    name: string
};

let ps = process.argv[2];
if (!ps) {
    throw new Error('usage: node tools/spritedata/items.ts <pokemon-showdown checkout>');
}

let require = createRequire(import.meta.url);
let {Items} = require(path.resolve(ps, 'dist/data/items.js')) as
    {Items: Record<string, ItemsEntry>};

let output: Record<string, ItemEntry> = {};

for (let {num, name} of Object.values(Items)) {
    let sid = Math.abs(num);
    if (num < 0) sid |= 1 << 29;

    let key = `i${sid}`;
    let entry = output[key];
    if (entry) {
        entry.names.push(name);
    } else {
        output[key] = {type: 'item', names: [name], sid: key};
    }
}

process.stdout.write(JSON.stringify(output, null, '    '));
