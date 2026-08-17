
import spritesmith from 'spritesmith'
import * as path from 'node:path';
import * as fs from 'node:fs';
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

let spaceRe = /[ _]+/g
let removeRe = /[^a-z0-9-]/g

export function toAlias(s: string) {
    s = s.toLowerCase()
    s = s.replace(spaceRe, '-')
    s = s.replace(removeRe, '')
    return s
}

let sprites = new Map;
for (let [filename, sprite] of Object.entries(result.coordinates)) {
    let parsed = spritedata.parseFilename(path.parse(filename).name);
    if (parsed.extension) {
        sprites.set(toAlias(parsed.name),sprite);
        continue;
    }
    let data = spritedata.get(parsed.id);
    if (data.type === 'specie') {
        // TODO would like to use toPSID here, mess with it later.
        let name = toAlias(data.base + (data.forme ? '-' + data.forme : ''));
        if (parsed.extra.has('g')) {
            name += '-gmax';
        } else if (parsed.extra.has('f')) {
            name += '-f';
        }
        sprites.set(name, sprite);
    } else {
        for (let name of data.names) {
            sprites.set(toAlias(name), sprite);
        }
    }
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

fs.writeFileSync(opts.image, result.image, 'binary');
fs.writeFileSync(opts.stylesheet, stylesheet);
