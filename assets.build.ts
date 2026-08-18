
import {gen6Padded, itemPadded} from './rules/minisprites.ts';
import {Manifest, itemspritecopy, spritecopy} from './rules/publish.ts';
import {rule} from './tools/build/artifact.ts';
import {spriteglob} from './tools/build/helpers.ts';
import {deploy} from './tools/deploy/api.ts';

// The tar root maps onto the served tree: sprites/x is served at
// /__assets/sprites/x. The upload rejects a tar whose tree disagrees with the
// prefix in services.toml, so the two are checked against each other rather
// than each guessing -- which is what lets the pointers below name whole urls
// and their readers hold no configuration. __meta/ is the exception: the
// upload diverts it to assets-meta/, beside the served tree and out of it.

let ASSETS = 'sprites';
let SERVED = '/__assets';

let minispriteInputs = spriteglob(['src/minisprites/pokemon/gen6/*', 'src/minisprites/items/*'], {a: false});

// Smogdex spritesheet. The sheet tool bakes sprite ids parsed from the %f
// filenames into the css, hence nameSensitive.

let [sheetPng, sheetCss] = rule(minispriteInputs, {
    display: 'smogdex sheet',
    nameSensitive: true,
    deps: [
        'data/species.json',
        'data/items.json',
        'data/lib/index.ts',
        'lib/root/index.ts',
        'tools/smogdexspritesheet/index.ts',
    ],
    cmds: ['node tools/smogdexspritesheet/index.ts --image %o1 --stylesheet %o2 -- %f'],
}, ['spritesheet.png', 'spritesheet.css']);

let sheetWebp = rule(sheetPng, ['cwebp -z 9 %f -o %o'], 'spritesheet.webp');

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

// Forumsprites: padded minisprites under stamped names, with the
// unhashed -> url mapping in a manifest.

let forumItems = itemPadded();
let forumG6 = gen6Padded();

deploy(async ctx => {
    let manifest = new Manifest(ctx, SERVED);
    for (let f of forumItems) {
        await itemspritecopy(manifest, f, {dir: `${ASSETS}/forumsprites`});
    }
    for (let f of forumG6) {
        await spritecopy(manifest, f, {dir: `${ASSETS}/forumsprites`}, true);
    }
    manifest.write('__meta/forumsprites/manifest.json');
});

// PMD sprites ship as-is, stamped.

deploy(async ctx => {
    let manifest = new Manifest(ctx, SERVED);
    for (let f of await ctx.list('src/pmd')) {
        await spritecopy(manifest, f, {dir: `${ASSETS}/pmd`});
    }
    manifest.write('__meta/pmd/manifest.json');
});
