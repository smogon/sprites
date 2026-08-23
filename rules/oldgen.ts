
import * as spritedata from '@smogon/sprite-data/index.ts';

import {type Artifact, type CmdSpec, rule} from '../tools/build/artifact.ts';
import {base, glob} from '../tools/build/helpers.ts';

// A source picked for an older-gen collection, and what the sprite built from
// it is called. The two differ because the game is spent on choosing the
// collection: `rb` and `y` are the same Zubat under two palettes, and neither
// output has a game left in its name. Dropping it is not cosmetic. `-g` is
// Gigantamax everywhere the grammar isn't naming a gen 1-4 game, so a name
// that kept it would reach publishedName() as `zubat-gmax`.
export type Front = {
    file: string,
    name: string,
};

// The gen 1-4 sets are each named for one game and sourced from several. `-g`
// spells the games a picture is the copy for, a letter apiece, and a
// collection takes them in preference order: the game it is named for first,
// then whatever drew the formes that game never did. That is how rs/ comes to
// hold Deoxys-Attack, which only FireRed drew, and dp/ the Rotom appliances
// and Giratina-Origin, which only Platinum did. Which layer wins a name is
// settled at copy time, by whoever claims it first.
//
// Gen 5 has no such axis -- there its `-g` really is Gigantamax -- so its sets
// pass no order, and keep every flag they came with.
export function fronts(pats: string | string[], games?: string): Front[] {
    let ranked = [];
    for (let file of glob(pats)) {
        let sn = spritedata.parseFilename(base(file));
        // Backs and shinies go unpublished: the legacy tree kept them in
        // subdirectories of their own, under national dex numbers, and
        // nothing on the site has ever read one.
        if (sn.extra.has('b') || sn.extra.has('s')) {
            continue;
        }
        let rank = 0;
        if (games !== undefined) {
            let code = sn.extra.get('g') ?? '';
            rank = [...games].findIndex(g => code.includes(g));
            // Another generation's game, or no game at all: not this set's.
            if (rank < 0) {
                continue;
            }
            sn.extra.delete('g');
        }
        ranked.push({file, name: spritedata.formatFilename(sn), rank});
    }
    // Stable, so within one game the glob's own order survives.
    return ranked.sort((a, b) => a.rank - b.rank).map(({file, name}) => ({file, name}));
}

// One rule per front, its output named for what it publishes. Several sources
// can land on one name -- Abra is the same drawing in Ruby and in Emerald --
// which is fine, since a nominal name is provenance and not identity.
export function forEachFront(files: Front[], spec: CmdSpec, ext: string): Artifact[] {
    return files.map(f => rule(f.file, spec, `${f.name}.${ext}`));
}

// The CAPs that were playable while Diamond and Pearl were. They were only
// ever drawn in gen 5's style, so dp/ carries them from the gen 5 sources the
// way the legacy set did -- and has to name them, since nothing in a filename
// says a sprite is a CAP.
export let GEN4_CAPS = [
    'arghonaut', 'colossoil', 'cyclohm', 'fidgit', 'kitsunoh', 'krilowatt',
    'pyroak', 'revenankh', 'stratagem', 'syclant', 'voodoom',
];

// Every front of the given species, formes and female slots included.
export function named(files: Front[], names: readonly string[]): Front[] {
    let want = new Set(names);
    return files.filter(f => want.has(spritedata.parseFilename(f.name).name));
}
