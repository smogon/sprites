
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

function toPSID(s:string) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

let sprites = new Map;
for (let [filename, sprite] of Object.entries(result.coordinates)) {
    let parsed = spritedata.parseFilename(path.parse(filename).name);
    if (parsed.extension) {
        sprites.set(toPSID(parsed.name),sprite);
        continue;
    }
    let data = spritedata.get(parsed.id);
    if (data.type === 'specie') {
        sprites.set(toPSID(data.base + data.forme), sprite);
    } else {
        for (let name of data.names) {
            sprites.set(toPSID(name), sprite);
        }
    }
}

let stylesheet = "";
for (let [id, sprite] of sprites) {
    stylesheet += `.sprite-${id}{background-position:${sprite.x}px ${sprite.y}px;width:${sprite.width}px;height:${sprite.height}px}`;
}

fs.writeFileSync(program.image, result.image, 'binary');
fs.writeFileSync(program.stylesheet, stylesheet);

