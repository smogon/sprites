import {createRequire} from 'node:module';
import * as path from 'node:path';

import {encode, type InputSpriteFilename} from '@smogon/sprite-data/index.ts';

// Everything the sprite tree wants from a pokemon-showdown checkout: which
// sprites should exist, and what each one is called.

export type Specie = {
    num: number,
    formeNum: number,
    base: string,
    forme: string
};

export type Item = {
    num: number,
    names: string[]
};

type PokedexEntry = {
    num: number,
    name: string,
    baseSpecies?: string,
    formeOrder?: string[]
};

type ItemsEntry = {
    num: number,
    name: string
};

function load<T>(ps: string, file: string, key: string): Record<string, T> {
    let require = createRequire(import.meta.url);
    let mod = require(path.resolve(ps, 'dist/data', file)) as Record<string, Record<string, T>>;
    let table = mod[key];
    if (table === undefined) {
        throw new Error(`${file} has no ${key} export; is ${ps} built?`);
    }
    return table;
}

export function species(ps: string): Specie[] {
    let out: Specie[] = [];
    for (let {num, name, baseSpecies, formeOrder} of Object.values(load<PokedexEntry>(ps, 'pokedex.js', 'Pokedex'))) {
        // Formes are enumerated from their base species, not on their own.
        if (baseSpecies) continue;
        for (let [formeNum, formeName] of (formeOrder ?? [name]).entries()) {
            // Gmax is a flag, not a forme.
            if (formeName.endsWith('-Gmax')) continue;
            out.push({num, formeNum, base: name, forme: formeName.slice(name.length + 1)});
        }
    }
    return out;
}

export function items(ps: string): Item[] {
    // One sprite per item number, so items sharing a number share a sprite and
    // collect their names: Aspear Berry is also Burnt Berry.
    let byNum = new Map<number, Item>();
    for (let {num, name} of Object.values(load<ItemsEntry>(ps, 'items.js', 'Items'))) {
        let item = byNum.get(num);
        if (item) {
            item.names.push(name);
        } else {
            byNum.set(num, {num, names: [name]});
        }
    }
    return [...byNum.values()];
}

// The filename each sprite should have. PS's formeOrder repeats a name where
// the games gave one forme several slots (Zygarde's Power Construct pair,
// Minior's seven meteors), and nothing in the data tells those apart, so the
// lowest slot keeps the bare name and the rest carry the slot in -c.
export function spriteFiles(ps: string): InputSpriteFilename[] {
    let out: InputSpriteFilename[] = [];
    let seen = new Set<string>();

    for (let {formeNum, base, forme} of species(ps)) {
        let name = encode(base);
        let extra = new Map<string, string>();
        if (forme) {
            extra.set('o', encode(forme));
        }
        let key = `${name}-${extra.get('o') ?? ''}`;
        if (seen.has(key)) {
            extra.set('c', String(formeNum));
        }
        seen.add(key);
        out.push({kind: 's', name, extra});
    }

    for (let {names} of items(ps)) {
        out.push({kind: 'i', name: encode(names[0]!)});
    }

    return out;
}
