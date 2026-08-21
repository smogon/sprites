import {createRequire} from 'node:module';
import * as path from 'node:path';

// Regenerates data/species.json from a pokemon-showdown checkout:
//
//   node tools/spritedata/species.ts ~/smogon/pokemon-showdown > data/species.json
//
// A sprite id packs the dex number and the game's forme index into one number,
// with bit 29 marking the negative nums CAP and fakemon use. Gmax formes get no
// id of their own; they ride on the base forme's -g flag.

type SpecieEntry = {
    type: 'specie',
    num: number,
    formeNum: number,
    base: string,
    forme: string,
    sid: string
};

type PokedexEntry = {
    num: number,
    name: string,
    baseSpecies?: string,
    formeOrder?: string[]
};

let ps = process.argv[2];
if (!ps) {
    throw new Error('usage: node tools/spritedata/species.ts <pokemon-showdown checkout>');
}

let require = createRequire(import.meta.url);
let {Pokedex} = require(path.resolve(ps, 'dist/data/pokedex.js')) as
    {Pokedex: Record<string, PokedexEntry>};

let output: Record<string, SpecieEntry> = {};

for (let {num, name, baseSpecies, formeOrder} of Object.values(Pokedex)) {
    // Formes are enumerated from their base species, not on their own.
    if (baseSpecies) continue;
    for (let [formeNum, formeName] of (formeOrder ?? [name]).entries()) {
        // Gmax is a flag, not a forme.
        if (formeName.endsWith('-Gmax')) continue;

        let sid = (Math.abs(num) << 5) + formeNum;
        if (num < 0) sid |= 1 << 29;

        let forme = formeName.slice(name.length + 1);
        let key = `s${sid}`;
        if (output[key]) throw new Error(`duplicate sid ${key} for ${name}`);
        output[key] = {type: 'specie', num, formeNum, base: name, forme, sid: key};
    }
}

process.stdout.write(JSON.stringify(output, null, '    ') + '\n');
