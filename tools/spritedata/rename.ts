import * as fs from 'node:fs';
import * as path from 'node:path';

import {encode, formatFilename, parseFilename, type InputSpriteFilename} from '@smogon/sprite-data/index.ts';
import root from '@smogon/sprite-root/index.ts';

import {items, species, spriteFiles} from './pokedex.ts';

// One-off: renames src/ off the packed numeric ids onto encoded names.
//
//   node tools/spritedata/rename.ts ~/smogon/pokemon-showdown [--dry-run]
//
// Kept for the record rather than for reuse. The old id packed the dex number
// and the forme index into one number, `s((|num| << 5) + formeNum)` with bit 29
// marking the negative nums CAP and fakemon use, and `i(|num|)` for items;
// src/previews/gen8 wrote the same number with no prefix at all. Reconstruct
// those here and map each to the name the file should have had.

let ps = process.argv[2];
let dryRun = process.argv.includes('--dry-run');
if (!ps) {
    throw new Error('usage: node tools/spritedata/rename.ts <pokemon-showdown checkout> [--dry-run]');
}

function legacy(num: number, formeNum: number): number {
    let sid = (Math.abs(num) << 5) + formeNum;
    return num < 0 ? sid | (1 << 29) : sid;
}

// spriteFiles() lists species then items, each in the order its own reader
// yields, so the ids line up positionally.
let files = spriteFiles(ps);
let sids = [
    ...species(ps).map(s => `s${legacy(s.num, s.formeNum)}`),
    ...items(ps).map(i => `i${i.num < 0 ? Math.abs(i.num) | (1 << 29) : i.num}`),
];
if (sids.length !== files.length) {
    throw new Error(`${sids.length} ids for ${files.length} sprites`);
}

let byId = new Map<string, InputSpriteFilename>();
for (let [i, sid] of sids.entries()) {
    byId.set(sid, files[i]!);
}

let renames: [string, string][] = [];
let missing = new Set<string>();

function walk(dir: string): void {
    for (let ent of fs.readdirSync(dir, {withFileTypes: true})) {
        let p = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            // Its own naming scheme, and nothing parses it.
            if (path.basename(p) !== '_uncategorized') walk(p);
            continue;
        }
        if (path.extname(p) === '.md') continue;

        let ext = path.extname(ent.name);
        let stem = ent.name.slice(0, -ext.length);
        let [id, ...flags] = stem.split('-');

        let file: InputSpriteFilename;
        if (id!.startsWith('x')) {
            file = {kind: 'x', name: encode(id!.slice(1))};
        } else {
            let found = byId.get(/^[0-9]+$/.test(id!) ? `s${id}` : id!);
            if (!found) {
                missing.add(id!);
                continue;
            }
            file = found;
        }

        let extra = new Map(file.extra);
        for (let flag of flags) {
            extra.set(flag.charAt(0), flag.slice(1));
        }
        let renamed = formatFilename({kind: file.kind, name: file.name, extra}) + ext;
        if (renamed !== ent.name) {
            renames.push([p, path.join(dir, renamed)]);
        }
    }
}

walk(path.join(root, 'src'));

if (missing.size) {
    throw new Error(`no sprite for ${[...missing].join(', ')}`);
}

let taken = new Set(renames.map(([, to]) => to));
if (taken.size !== renames.length) {
    throw new Error('renames collide');
}

for (let [from, to] of renames) {
    if (!dryRun) fs.renameSync(from, to);
}
process.stderr.write(`${dryRun ? 'would rename' : 'renamed'} ${renames.length} files\n`);
