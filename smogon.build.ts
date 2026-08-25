
import * as spritedata from '@smogon/sprite-data/index.ts';

import {AVATARS, AVATAR_ALIASES, avatarSlots} from './rules/avatars.ts';
import {gen10Modelslike} from './rules/modelslike.ts';
import {GEN4_CAPS, forEachFront, fronts, named} from './rules/oldgen.ts';
import {Manifest, type Sprite, type Tree, firstWins, itemspritecopy, spritecopy} from './rules/publish.ts';
import {type Artifact, type CmdSpec, forEachRule, rule} from './tools/build/artifact.ts';
import {base, compresspng, pad, spriteglob, trimimg} from './tools/build/helpers.ts';
import {type DeployCtx, deploy} from './tools/deploy/api.ts';

// The tar root maps onto the served tree: sprites/x is served at
// /__assets/sprites/x. The upload rejects a tar whose tree disagrees with the
// prefix in services.toml, so the two are checked against each other rather
// than each guessing -- which is what lets the pointers below name whole urls
// and their readers hold no configuration. __meta/ is the exception: the
// upload diverts it to assets-meta/, beside the served tree and out of it.

let ASSETS = 'sprites';
let SERVED = '/__assets';
let TREE: Tree = {root: ASSETS, served: `${SERVED}/${ASSETS}`};

// Where the un-stamped names go. A served name carries a content hash and so
// can be cached forever, which is exactly why it can't be composed by a reader
// that knows only the sprite: the smogdex asks for sprites/xy/charizard.gif
// and reads no manifest. So the sets it composes paths into publish the tree a
// second time, as links under the un-stamped names naming the stamped file.
// They ride in __meta/ rather than the served tree because the tree is
// add-only -- a name in it is promised never to change -- and a link is
// repointed on every upload; the upload retargets each one at where its asset
// landed on its side, under a directory it already names for this set.
let LINKS = '__meta/links';

let minispriteInputs = spriteglob(['src/minisprites/pokemon/gen6/*', 'src/minisprites/items/*'], {a: false});

// sprites/xy/ animations: first source wins per sprite name.

let xyModels = forEachRule('src/gen9species/*.png', {
    display: '96x96 %f',
    // TODO, add customizable compression for gif
    // ... or investigate using webp instead of both png/gif here
    cmds: [
        'magick %f -trim +repage -resize 90x90 %o',
        'gifsicle -O3 -w -b %o',
    ],
}, '%B.gif');

let xyChampions = gen10Modelslike();

// Whatever the models don't cover, in gen 5 style: the CAPs that never got a
// model, and, since the Smogon Sprite Project's batch landed, the Gigantamax
// formes and a few others.

let xyGen5 = forEachRule('src/sprites/gen5/*.png', [
    // TODO, add customizable compression for gif
    // ... or investigate using webp instead of both png/gif here
    'magick %f %o',
    'gifsicle -O3 -w -b %o',
], '%B.gif');

deploy(async ctx => {
    let manifest = new Manifest(ctx, TREE);
    let xycopy = firstWins(manifest, {dir: 'xy'});
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
    manifest.write('__meta/xy/manifest.json');
    manifest.links(LINKS);
});

// sprites/xyicons/: trimmed gen6 minisprites.

let xyIcons = forEachRule('src/minisprites/pokemon/gen6/*.png', {
    display: 'trim g6 minisprite %f',
    cmds: [trimimg(), compresspng({config: 'MINISPRITE'})],
}, '%b');

deploy(async ctx => {
    // icons: the gen 6 set has no art for some formes and lends them another's,
    // which the smogdex sheet and forumsprites do off the same directory. Two
    // formes lent the same icon are a duplicate name the manifest refuses.
    let manifest = new Manifest(ctx, TREE);
    for (let f of xyIcons) {
        await spritecopy(manifest, f, {dir: 'xyicons'}, {icons: true});
    }
    manifest.write('__meta/xyicons/manifest.json');
    manifest.links(LINKS);
});

// sprites/rb, rg, y, c, rs, dp, bw: the older-gen full sprites, the front of
// each generation under the name the smogdex, the forum and chatot each
// compose from a dex alias. They read no manifest, which is why these ride
// the LINKS mirror the way xy/ does.

function trimmed(display: string): CmdSpec {
    return {display, cmds: [trimimg(), compresspng({config: 'SPRITE'})]};
}

// Red and Blue and Japanese Red and Green are two palettes of one set of
// drawings; Yellow's are the Game Boy Color's, which is a directory of its
// own, the sprites beside it being the Super Game Boy ones.
let gen1 = trimmed('gen 1 sprite %f');
let rb = forEachFront(fronts('src/sprites/gen1/*.png', 'b'), gen1, 'png');
let rg = forEachFront(fronts('src/sprites/gen1/*.png', 'g'), gen1, 'png');
let y = forEachFront(fronts('src/sprites/gen1/gbc/*.png', 'y'), gen1, 'png');

// Crystal's animations come at the games' own 56x56 and are published on the
// 60x60 box the legacy set used: the smogdex scales a sprite to fill its
// frame, so trimmed, a Diglett would arrive the size of a Steelix.
let c = forEachFront(fronts('src/sprites/gen2/*.gif'), {
    display: 'gen 2 animation %f',
    cmds: [
        'magick %f -coalesce -background none -gravity center -extent 60x60 %o',
        'gifsicle -O3 -w -b %o',
    ],
}, 'gif');

let rs = forEachFront(fronts('src/sprites/gen3/*.png', 'rfle'), trimmed('gen 3 sprite %f'), 'png');

let dp = forEachFront([
    ...fronts('src/sprites/gen4/*.png', 'dph'),
    ...named(fronts('src/sprites/gen5/*.png'), GEN4_CAPS),
], trimmed('gen 4 sprite %f'), 'png');

function oldgen(dir: string, sources: (ctx: DeployCtx) => Promise<Sprite[]>): void {
    deploy(async ctx => {
        let manifest = new Manifest(ctx, TREE);
        let copy = firstWins(manifest, {dir});
        for (let f of await sources(ctx)) {
            await copy(f);
        }
        manifest.write(`__meta/${dir}/manifest.json`);
        manifest.links(LINKS);
    });
}

oldgen('rb', async () => rb);
oldgen('rg', async () => rg);
oldgen('y', async () => y);
oldgen('c', async () => c);
oldgen('rs', async () => rs);
oldgen('dp', async () => dp);
// bw/ is gen 5's animations, backfilled from the gen 5-style stills for what
// the games never animated: the CAPs, and everything the Smogon Sprite
// Project has drawn since. The stills are the rule set xy/ already layers on.
oldgen('bw', async ctx => [
    ...(await ctx.list('src/sprites/gen5')).filter(f => f.ext === 'gif'),
    ...xyGen5,
]);

// sprites/minisprites/: the smogdex's icons as files, one apiece, for a reader
// that wants one of them rather than the whole sheet. The sources ship
// verbatim, which is what makes a file and its cell in the sheet the same
// picture; xyicons/ is the trimmed reading of the same set.
//
// They ride the LINKS mirror because what asks for one composes the path out of
// the sprite and nothing else, which is what the set used to make it read a
// whole-set hash out of a pointer file to do.

deploy(async ctx => {
    let manifest = new Manifest(ctx, TREE);
    for (let f of await ctx.list('src/minisprites/items')) {
        await itemspritecopy(manifest, f, {dir: 'minisprites'});
    }
    for (let f of await ctx.list('src/minisprites/pokemon/gen6')) {
        await spritecopy(manifest, f, {dir: 'minisprites'}, {icons: true});
    }
    manifest.write('__meta/minisprites/manifest.json');
    manifest.links(LINKS);
});

// Smogdex spritesheet. The sheet tool bakes the names parsed from the %f
// filenames into the css, hence nameSensitive. The png is declared only so
// cwebp has something to read; only the css and the webp are published.
// A sprite's place in the sheet is one grid index, so the css is a rule of
// geometry per region and a single declaration per name.

let [, sheetCss, sheetWebp] = rule(minispriteInputs, {
    display: 'smogdex sheet',
    nameSensitive: true,
    deps: [
        'data/lib/index.ts',
        'tools/smogdexspritesheet/index.ts',
        'tools/smogdexspritesheet/layout.ts',
    ],
    cmds: [
        'node tools/smogdexspritesheet/index.ts --image %o1 --stylesheet %o2 -- %f',
        'cwebp -z 9 %o1 -o %o3',
    ],
}, ['spritesheet.png', 'spritesheet.css', 'spritesheet.webp']);

// Hash-stamped css + webp. The css url rides in __meta/ for the dex to read.
deploy(async ctx => {
    let wh = await ctx.hash(sheetWebp);
    ctx.copy(sheetWebp, `${ASSETS}/spritesheet-${wh}.webp`);
    let src = await ctx.read(sheetCss);
    let css = src.replaceAll('url("./spritesheet.webp")', `url("./spritesheet-${wh}.webp")`);
    if (css === src) {
        throw new Error('spritesheet.css: no webp urls rewritten');
    }
    // Suffix from source content: the rewritten css is a pure function
    // of (css, webp), so this changes exactly when the served bytes
    // change.
    let ch = await ctx.hash(sheetCss, sheetWebp);
    ctx.write(`${ASSETS}/spritesheet-${ch}.css`, css);
    ctx.write('__meta/spritesheet-css-url.txt', `${SERVED}/${ASSETS}/spritesheet-${ch}.css\n`);
});

// Forumsprites: uniform-size minisprites under stamped names, with the
// unhashed -> url mapping in a manifest.

let forumItems = forEachRule('src/minisprites/items/*.png', {
    display: 'pad item minisprite %f',
    cmds: [pad({w: 24, h: 24}), compresspng({config: 'MINISPRITE'})],
}, '%b');

let forumG6 = forEachRule('src/minisprites/pokemon/gen6/*.png', {
    display: 'pad g6 minisprite %f',
    cmds: [pad({w: 40, h: 30}), compresspng({config: 'MINISPRITE'})],
}, '%b');

deploy(async ctx => {
    let manifest = new Manifest(ctx, TREE);
    for (let f of forumItems) {
        await itemspritecopy(manifest, f, {dir: 'forumsprites'});
    }
    for (let f of forumG6) {
        await spritecopy(manifest, f, {dir: 'forumsprites'}, {allowUnknown: true, icons: true});
    }
    manifest.write('__meta/forumsprites/manifest.json');
});

// sprites/types/gen5/: the Black & White type labels, for the forum, which
// looks one up rather than composing a path, so the set rides no links mirror
// -- forumsprites, the other set the forum reads, doesn't either.
//
// The two source directories publish into one. Which of them a label came from
// says whether the games drew it in this style, which is a fact about the
// picture and not about the reader: Fairy and Stellar are types the forum
// renders like any other, and gen 5 simply never labelled them.
//
// They ship verbatim. A label is already the picture, at 32x12 and a couple
// hundred bytes, so there is nothing for a rule to do to one.

deploy(async ctx => {
    let manifest = new Manifest(ctx, TREE);
    for (let canon of ['canonical', 'noncanonical']) {
        for (let f of await ctx.list(`src/_uncategorized/${canon}/ui/types/gen5`)) {
            // Held back: the only build that ever published this one renamed it
            // to `???`, which is PS's name for the type. What the forum calls it
            // is for the forum to say.
            if (f.name === 'Unknown') {
                continue;
            }
            await manifest.copy(f, {dir: 'types/gen5'}, spritedata.encode(f.name));
        }
    }
    manifest.write('__meta/types/gen5/manifest.json');
});

// Forum auto avatars: the gen 5 animations on a uniform 96x96 box, which is
// what XenForo's avatar container is. It scales an <img> to fill, so a sprite
// published at its own aspect would arrive stretched; the box is the games' own
// sprite size, so nothing is scaled up.
//
// The 40 slots whose animation is drawn wider or taller than the box -- a
// wingspan, mostly, and Lugia's is 153px of it -- are shrunk into it rather
// than cropped to it. The box is there to hold the picture, and an extent that
// trims one cuts the wings off flat at the frame edge. Resampling a 16-color
// picture invents shades, so the frames are requantized afterwards, which is
// what keeps those 40 from doubling in bytes; 64 is above every source palette
// here, so the slots that fit the box are untouched by it.

// The pool with its two second slots resolved, which is the set of pictures to
// build. See rules/avatars.ts for why it is a list and not a glob.
let avatarPool = new Set(AVATARS.map(name => AVATAR_ALIASES[name] ?? name));

let avatarArt = new Map<string, Artifact>();
for (let f of spriteglob(['src/sprites/gen5/*.gif', 'src/sprites/gen5/xsubstitute.png'],
                         {b: false, s: false})) {
    // publishedNames() is no use here: it resolves smogon names where the pool
    // is spelled in PS ids, and it refuses the one x-kind sprite the pool
    // carries. Backs and shinies are filtered above rather than here, since
    // publishedName spells them exactly as it spells their front.
    let name = spritedata.publishedName(spritedata.parseFilename(base(f)), spritedata.psid);
    if (!avatarPool.has(name)) {
        continue;
    }
    if (avatarArt.has(name)) {
        throw new Error(`avatar ${name}: two gen 5 sources publish it`);
    }
    avatarArt.set(name, rule(f, {
        display: 'avatar %f',
        cmds: [
            'magick %f -coalesce -background none -resize "96x96>" -dither None -colors 64 -gravity center -extent 96x96 %o',
            'gifsicle -O3 -w -b %o',
        ],
    }, `${name}.gif`));
}

// A pool member with no source would leave the forum a shorter list and
// reassign every user, so a source renamed out from under one fails the build
// rather than the deploy.
for (let name of avatarPool) {
    if (!avatarArt.has(name)) {
        throw new Error(`avatar ${name}: no gen 5 source`);
    }
}

deploy(async ctx => {
    let manifest = new Manifest(ctx, TREE);
    for (let [name, art] of avatarArt) {
        await manifest.copy(art, {dir: 'avatars'}, name);
    }
    // Published by slot rather than by name: nothing looks an avatar up, the
    // forum picks one with crc32(username) % count, so the order is the whole
    // mapping and the length is the divisor.
    let slots = avatarSlots().map(name => manifest.url(AVATAR_ALIASES[name] ?? name));
    ctx.write('__meta/avatars/manifest.json', JSON.stringify(slots, null, 4) + '\n');
});

// PMD sprites ship as-is, stamped.

deploy(async ctx => {
    let manifest = new Manifest(ctx, TREE);
    for (let f of await ctx.list('src/pmd')) {
        await spritecopy(manifest, f, {dir: 'pmd'});
    }
    manifest.write('__meta/pmd/manifest.json');
});

// Deprecated, unstamped sets. Reviving one also means importing what it
// uses (PNG_DETERMINISTIC, base) and giving the copies a Manifest, as the
// deploys above do.
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
//         `magick "%f[0]" ${PNG_DETERMINISTIC} -trim -resize 150x150 -background white -gravity center -extent 198x198 -bordercolor black -border 1 %o`,
//         compresspng({config: 'MODELS'}),
//     ],
// }, '%B.png');
//
// let twitter = forEachRule(socialInputs(), {
//     display: 'twittersprite %f',
//     cmds: [
//         `magick "%f[0]" ${PNG_DETERMINISTIC} -trim -resize 115x115 -background white -gravity center -extent 120x120 %o`,
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
