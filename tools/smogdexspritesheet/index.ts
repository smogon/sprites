
import spritesmith from 'spritesmith'
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as util from 'node:util';
import * as spritedata from '@smogon/sprite-data/index.ts';

let {values: opts, positionals: srcs} = util.parseArgs({
    options: {
        image: {type: 'string'},
        stylesheet: {type: 'string'},
    },
    allowPositionals: true,
});
if (opts.image === undefined || opts.stylesheet === undefined) {
    throw new Error('usage: --image <file> --stylesheet <file> -- <sprites...>');
}

let run = util.promisify(spritesmith.run);

let result = await run({
    src: srcs
});

let sprites = new Map;
for (let [filename, sprite] of Object.entries(result.coordinates)) {
    let parsed = spritedata.parseFilename(path.parse(filename).name);
    if (parsed.kind === 'i') {
        sprites.set(spritedata.smogon(parsed.name), sprite);
        for (let alias of spritedata.ITEM_ALIASES[parsed.name] ?? []) {
            sprites.set(spritedata.smogon(alias), sprite);
        }
        continue;
    }
    // TODO would like to use psid here, mess with it later.
    let name = spritedata.smogon(parsed.name);
    let forme = parsed.extra.get('o');
    if (forme) {
        name += `-${spritedata.smogon(forme)}`;
    }
    if (parsed.extra.has('g')) {
        name += '-gmax';
    } else if (parsed.extra.has('f')) {
        name += '-f';
    }
    sprites.set(name, sprite);
}

let stylesheet = '';
for (let [id, sprite] of sprites) {
    // webp reference depends on optimization in Tupfile, fix it later, just need to ship
    stylesheet += `.sprite-${id} {
    background-image: url("./spritesheet.webp");
    background-repeat: no-repeat;
    background-position:-${sprite.x}px -${sprite.y}px;
    width:${sprite.width}px;
    height:${sprite.height}px
    }`;
}

await fs.writeFile(opts.image, result.image, 'binary');
await fs.writeFile(opts.stylesheet, stylesheet);
