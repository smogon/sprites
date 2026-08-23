
import {gen10Modelslike} from './rules/modelslike.ts';
import {GEN4_CAPS, forEachFront, fronts, named} from './rules/oldgen.ts';
import {Manifest, type Sprite, type Tree, firstWins, itemspritecopy, spritecopy} from './rules/publish.ts';
import {type CmdSpec, forEachRule, rule} from './tools/build/artifact.ts';
import {compresspng, pad, spriteglob, trimimg} from './tools/build/helpers.ts';
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
        'magick convert %f -coalesce -background none -gravity center -extent 60x60 %o',
        'gifsicle -O3 -b %o',
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

// Smogdex spritesheet. The sheet tool bakes the names parsed from the %f
// filenames into the css, hence nameSensitive. The png is declared only so
// cwebp has something to read; only the css and the webp are published.

let [, sheetCss, sheetWebp] = rule(minispriteInputs, {
    display: 'smogdex sheet',
    nameSensitive: true,
    deps: [
        'data/lib/index.ts',
        'tools/smogdexspritesheet/index.ts',
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
