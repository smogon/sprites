
import {gen10Modelslike} from './rules/modelslike.ts';
import {Manifest, type Sprite, publishedNames, spritecopy} from './rules/publish.ts';
import {forEachRule} from './tools/build/artifact.ts';
import {compresspng, trimimg} from './tools/build/helpers.ts';
import {deploy} from './tools/deploy/api.ts';

// xy/ animations: first source wins per sprite name.

let xyModels = forEachRule('src/gen9species/*.png', {
    display: '96x96 %f',
    // TODO, add customizable compression for gif
    // ... or investigate using webp instead of both png/gif here
    cmds: [
        'magick convert %f -trim +repage -resize 90x90 %o',
        'gifsicle -O3 -b %o',
    ],
}, '%B.gif');

let xyChampions = gen10Modelslike();

// Whatever the models don't cover, in gen 5 style: the CAPs that never got a
// model, and, since the Smogon Sprite Project's batch landed, the Gigantamax
// formes and a few others.

let xyGen5 = forEachRule('src/sprites/gen5/*.png', [
    // TODO, add customizable compression for gif
    // ... or investigate using webp instead of both png/gif here
    'magick convert %f %o',
    'gifsicle -O3 -b %o',
], '%B.gif');

deploy(async ctx => {
    let seen = new Set<string>();
    let manifest = new Manifest(ctx);
    // First source wins per published name rather than per filename, because
    // the later sources are backfills and a name can be spelled more than one
    // way. gen 5 carries a sprite per forme slot, so its six Minior meteors
    // and two Zygarde Power Construct slots all want the name the models
    // already publish, which the manifest would reject as a duplicate.
    let xycopy = async (f: Sprite) => {
        let names = publishedNames(f);
        if (names.some(n => seen.has(n))) {
            return;
        }
        for (let name of names) {
            seen.add(name);
            await manifest.copy(f, {dir: 'xy'}, name);
        }
    };

    for (let f of await ctx.list('src/models')) {
        await xycopy(f);
    }
    for (let f of xyModels) {
        await xycopy(f);
    }
    for (let f of xyChampions) {
        await xycopy(f);
    }
    for (let f of await ctx.list('src/sprites/gen5')) {
        if (f.ext === 'gif') {
            await xycopy(f);
        }
    }
    for (let f of xyGen5) {
        await xycopy(f);
    }
    manifest.write('xy/manifest.json');
});

// xyicons/: trimmed gen6 minisprites.

let xyIcons = forEachRule('src/minisprites/pokemon/gen6/*.png', {
    display: 'trim g6 minisprite %f',
    cmds: [trimimg(), compresspng({config: 'MINISPRITE'})],
}, '%b');

deploy(async ctx => {
    let manifest = new Manifest(ctx);
    for (let f of xyIcons) {
        await spritecopy(manifest, f, {dir: 'xyicons'});
    }
    manifest.write('xyicons/manifest.json');
});

// Deprecated, unstamped sets. Reviving one also means importing what it
// uses (PNG_DETERMINISTIC, base, spriteglob, itemspritecopy) and giving the
// copies a Manifest, as the stamped deploys above do.
//
// let xyItems = forEachRule('src/minisprites/items/*.png', {
//     display: 'trim item minisprite %f',
//     cmds: [trimimg(), compresspng({config: 'MINISPRITE'})],
// }, '%b');
//
// Smogdex social images: models, backfilled with gen9 species not yet in
// models (first source wins).
//
// function socialInputs(): string[] {
//     let social = spriteglob(['src/models/*'], {b: false, s: false});
//     let socialSeen = new Set(social.map(base));
//     for (let file of spriteglob(['src/gen9species/*'], {b: false, s: false})) {
//         if (!socialSeen.has(base(file))) {
//             social.push(file);
//             socialSeen.add(base(file));
//         }
//     }
//     return social;
// }
//
// let fb = forEachRule(socialInputs(), {
//     display: 'fbsprite %f',
//     cmds: [
//         `magick convert "%f[0]" ${PNG_DETERMINISTIC} -trim -resize 150x150 -background white -gravity center -extent 198x198 -bordercolor black -border 1 %o`,
//         compresspng({config: 'MODELS'}),
//     ],
// }, '%B.png');
//
// let twitter = forEachRule(socialInputs(), {
//     display: 'twittersprite %f',
//     cmds: [
//         `magick convert "%f[0]" ${PNG_DETERMINISTIC} -trim -resize 115x115 -background white -gravity center -extent 120x120 %o`,
//         compresspng({config: 'MODELS'}),
//     ],
// }, '%B.png');
//
// deploy(ctx => {
//     for (let f of xyItems) {
//         itemspritecopy(?, f, {dir: "xyitems"});
//     }
//     for (let f of fb) {
//         spritecopy(?, f, {dir: "fbsprites/xy"});
//     }
//     for (let f of twitter) {
//         spritecopy(?, f, {dir: "twittersprites/xy"});
//     }
// });
