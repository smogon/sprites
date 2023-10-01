
import program from 'commander'
import spritesmith from 'spritesmith'
import path from 'path'
import fs from 'fs'
import util from 'util';
import * as spritedata from '@smogon/sprite-data';

program
    .option('--image <file>', 'where to put image')
    .option('--stylesheet <file>', 'where to put stylesheet')
    .parse(process.argv)

const run = util.promisify(spritesmith.run);

let result = await run({
    src: program.args
});

const spaceRe = /[ _]+/g
const removeRe = /[^a-z0-9-]/g

export function toAlias(s: string) {
    s = s.toLowerCase()
    s = s.replace(spaceRe, "-")
    s = s.replace(removeRe, "")
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
        let name = toAlias(data.base + (data.forme ? "-" + data.forme : ""));
        if (parsed.extra.has("g")) {
            name += "-gmax";
        } else if (parsed.extra.has("f")) {
            name += "-f";
        }
        sprites.set(name, sprite);
    } else {
        for (let name of data.names) {
            sprites.set(toAlias(name), sprite);
        }
    }
}

let stylesheet = "";
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

fs.writeFileSync(program.image, result.image, 'binary');
fs.writeFileSync(program.stylesheet, stylesheet);
