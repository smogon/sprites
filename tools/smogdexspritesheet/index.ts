
import spritesmith from 'spritesmith'
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as util from 'node:util';
import * as spritedata from '@smogon/sprite-data/index.ts';

import {pack, place, stylesheet, type Cell, type Image} from './layout.ts';

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

// spritesmith's types stop at run()/createImages()/processImages(), but the
// engine those sit on is a spec of its own -- createCanvas, addImage, export
// -- and reaching it is what lets the sheet be laid out here instead of by
// spritesmith's packer.
type Canvas = {
    addImage(image: Image, x: number, y: number): void,
    // An old-style stream, from save-pixels underneath: events, not iteration.
    export(opts: {format: string}): NodeJS.ReadableStream,
};
type Engine = {createCanvas(width: number, height: number): Canvas};

let smith = new spritesmith();
let engine = (smith as unknown as {engine: Engine}).engine;
let images = await util.promisify(smith.createImages.bind(smith))(srcs);

let pokemon: Cell[] = [];
let items: Cell[] = [];

// createImages hands the images back in the order it was given the files.
for (let [i, src] of srcs.entries()) {
    let image = images[i];
    if (image === undefined) {
        throw new Error(`${src}: no image read`);
    }
    let parsed = spritedata.parseFilename(path.parse(src).name);
    if (parsed.kind === 'i') {
        let names = [parsed.name, ...spritedata.ITEM_ALIASES[parsed.name] ?? []];
        items.push({names: names.map(spritedata.smogon), image});
    } else {
        // TODO would like to use psid here, mess with it later.
        pokemon.push({names: spritedata.iconNames(parsed), image});
    }
}

let sheet = pack([
    {name: 'pokemon', modifier: null, cells: pokemon},
    {name: 'items', modifier: 'item', cells: items},
]);

let canvas = engine.createCanvas(sheet.width, sheet.height);
for (let layout of sheet.layouts) {
    for (let [i, cell] of layout.cells.entries()) {
        // Flush against the left of its cell, so the x offset is the column
        // and nothing else, and centred down it, so a short sprite sits where
        // its own box used to. The element is only as wide as the sprite, so
        // the rest of the cell stays behind it and no neighbour shows through.
        let {x, y} = place(layout, i);
        canvas.addImage(cell.image, x, y + Math.floor((layout.cellH - cell.image.height) / 2));
    }
}

let png = await new Promise<Buffer>((resolve, reject) => {
    let chunks: Uint8Array[] = [];
    let out = canvas.export({format: 'png'});
    out.on('data', chunk => chunks.push(chunk));
    out.on('end', () => resolve(Buffer.concat(chunks)));
    out.on('error', reject);
});

await fs.writeFile(opts.image, png);
// The url is rewritten to the stamped name at deploy time; keep it spelled
// exactly this way.
await fs.writeFile(opts.stylesheet, stylesheet(sheet, './spritesheet.webp'));
