
import {gen6Padded, itemPadded} from './rules/minisprites.ts';
import {Manifest, itemspritecopy, newspritecopy, spritecopy} from './rules/publish.ts';
import {forEachRule, rule} from './tools/build/artifact.ts';
import {spriteglob} from './tools/build/helpers.ts';
import {deploy} from './tools/deploy/api.ts';

// Smogdex minisprites (webp), shipped under a whole-set content hash with
// a pointer in __meta/ for the dex to read.

let minispriteInputs = spriteglob(['src/minisprites/pokemon/gen6/*', 'src/minisprites/items/*'], {a: false});

let webpMinisprites = forEachRule(minispriteInputs, {
    display: 'webp minisprite %f',
    cmds: ['cwebp -z 9 %f -o %o'],
}, '%B.webp');

deploy(async ctx => {
    let h = await ctx.hash(...webpMinisprites);
    for (let f of webpMinisprites) {
        newspritecopy(ctx, f, {dir: 'minisprites/' + h});
    }
    ctx.write('__meta/minisprites-hash.txt', h);
});

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

// Hash-stamped css + webp. The css suffix pointer rides in __meta/ for the
// dex to read.
deploy(async ctx => {
    let wh = await ctx.hash(sheetWebp);
    ctx.copy(sheetWebp, `spritesheet-${wh}.webp`);
    let src = await ctx.read(sheetCss);
    let css = src.replaceAll('url("./spritesheet.webp")', `url("./spritesheet-${wh}.webp")`);
    if (css === src) {
        throw new Error('spritesheet.css: no webp urls rewritten');
    }
    // Suffix from source content: the rewritten css is a pure function
    // of (css, webp), so this changes exactly when the served bytes
    // change.
    let ch = await ctx.hash(sheetCss, sheetWebp);
    ctx.write(`spritesheet-${ch}.css`, css);
    ctx.write('__meta/spritesheet_css_suffix.txt', `-${ch}\n`);
});

// Forumsprites: padded minisprites under stamped names, with the
// unhashed -> hashed mapping in a manifest.

let forumItems = itemPadded();
let forumG6 = gen6Padded();

deploy(async ctx => {
    let manifest = new Manifest(ctx);
    for (let f of forumItems) {
        await itemspritecopy(manifest, f, {dir: 'forumsprites'});
    }
    for (let f of forumG6) {
        await spritecopy(manifest, f, {dir: 'forumsprites'}, true);
    }
    manifest.write('__meta/forumsprites/manifest.json');
});

// PMD sprites ship as-is, stamped.

deploy(async ctx => {
    let manifest = new Manifest(ctx);
    for (let f of await ctx.list('src/pmd')) {
        await spritecopy(manifest, f, {dir: 'pmd'});
    }
    manifest.write('__meta/pmd/manifest.json');
});
