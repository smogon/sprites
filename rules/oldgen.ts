
import * as spritedata from '@smogon/sprite-data/index.ts';

import {type Artifact, type CmdSpec, rule} from '../tools/build/artifact.ts';
import {base, glob} from '../tools/build/helpers.ts';

// A source file picked for an older-gen collection, with the name of the
// sprite built from it. The name drops the game, which only chose the
// collection: `rb` and `y` are the same Zubat under two palettes, and neither
// output names a game. Dropping it is not cosmetic. `-g` means Gigantamax
// everywhere the grammar isn't naming a gen 1-4 game, so a name that kept it
// would reach publishedName() as `zubat-gmax`.
export type Front = {
    file: string,
    name: string,
};

// Picks the fronts for a collection, in the preference order `games` gives.
// The gen 1-4 sets are each named for one game and sourced from several: `-g`
// spells the games a picture is the copy for, a letter apiece, and `games`
// lists the game the set is named for first, then whichever drew the formes
// that game never did. That is how rs/ comes to hold Deoxys-Attack, which only
// FireRed drew, and dp/ the Rotom appliances and Giratina-Origin, which only
// Platinum did. Which layer wins a name is settled at copy time, by whoever
// claims it first.
//
// Gen 5 has no such axis (there `-g` really is Gigantamax), so its sets pass
// no `games` and keep every flag they came with.
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
            // None of this set's games drew it: it's another generation's, or
            // no game's at all.
            if (rank < 0) {
                continue;
            }
            sn.extra.delete('g');
        }
        ranked.push({file, name: spritedata.formatFilename(sn), rank});
    }
    // The sort is stable, so within one game the glob's order survives.
    return ranked.sort((a, b) => a.rank - b.rank).map(({file, name}) => ({file, name}));
}

// Makes one rule per front, its output named for what it publishes. Several
// sources can land on one name, as Abra is the same drawing in Ruby and in
// Emerald. That's fine: a nominal name records provenance, not identity.
export function forEachFront(files: Front[], spec: CmdSpec, ext: string): Artifact[] {
    return files.map(f => rule(f.file, spec, `${f.name}.${ext}`));
}

// The gen 4 CAP families: the eleven CAPs a gen 4 process produced, and the
// prevos later processes gave them. None of it was drawn in gen 4's style --
// the CAPs were only ever drawn in gen 5's, and the prevos did not exist until
// BW -- so dp/ carries the lot from the gen 5 sources, as the legacy set did
// for the eleven. A prevo lands on a gen 4 dex page like its evolution does,
// which is why it is here too. The list is by hand, since nothing in a
// filename says a sprite is a CAP.
export let GEN4_CAPS = [
    'arghonaut', 'breezi', 'colossoil', 'cyclohm', 'dorsoil', 'duohm',
    'embirch', 'fidgit', 'flarelm', 'kitsunoh', 'krilowatt', 'monohm',
    'nohface', 'privatyke', 'protowatt', 'pyroak', 'rebble', 'revenankh',
    'stratagem', 'syclant', 'syclar', 'tactite', 'voodoll', 'voodoom',
];

// Keeps the fronts of the given species, formes and female slots included.
export function named(files: Front[], names: readonly string[]): Front[] {
    let want = new Set(names);
    return files.filter(f => want.has(spritedata.parseFilename(f.name).name));
}
