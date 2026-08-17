
import {gen6Trimmed} from './rules/minisprites.ts';
import {gen10Modelslike, gen5Gifs, gen9Modelslike} from './rules/modelslike.ts';
import {Manifest, type Sprite, spritecopy} from './rules/publish.ts';
import {deploy} from './tools/deploy/api.ts';

// xy/ animations: first source wins per sprite name.

let xyModels = gen9Modelslike();
let xyChampions = gen10Modelslike();
let xyGen5 = gen5Gifs();

deploy(async ctx => {
    let seenModels = new Set<string>();
    let manifest = new Manifest(ctx);
    let xycopy = async (f: Sprite) => {
        if (seenModels.has(f.name)) {
            return;
        }
        seenModels.add(f.name);
        await spritecopy(manifest, f, {dir: 'xy'});
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
    // Non-model CAPs
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

let xyIcons = gen6Trimmed();

deploy(async ctx => {
    let manifest = new Manifest(ctx);
    for (let f of xyIcons) {
        await spritecopy(manifest, f, {dir: 'xyicons'});
    }
    manifest.write('xyicons/manifest.json');
});

// Deprecated, unstamped sets:
// let xyItems = itemTrimmed();       (rules/minisprites.ts)
// let fb = fbSprites();              (rules/social.ts)
// let twitter = twitterSprites();    (rules/social.ts)
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
