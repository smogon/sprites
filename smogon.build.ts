
import {gen6Trimmed} from './rules/minisprites.ts';
import {gen10Modelslike, gen5Gifs, gen9Modelslike} from './rules/modelslike.ts';
import {Manifest, type Sprite, spritecopy} from './rules/publish.ts';
import {deploy} from './tools/deploy/api.ts';

// xy/ animations: first source wins per sprite name.

const xyModels = gen9Modelslike();
const xyChampions = gen10Modelslike();
const xyGen5 = gen5Gifs();

deploy(ctx => {
    const seenModels = new Set<string>();
    const manifest = new Manifest(ctx);
    const xycopy = (f: Sprite) => {
        if (seenModels.has(f.name)) {
            return;
        }
        seenModels.add(f.name);
        spritecopy(manifest, f, {dir: 'xy'});
    };

    for (const f of ctx.list('src/models')) {
        xycopy(f);
    }
    for (const f of xyModels) {
        xycopy(f);
    }
    for (const f of xyChampions) {
        xycopy(f);
    }
    // Non-model CAPs
    for (const f of ctx.list('src/sprites/gen5')) {
        if (f.ext === 'gif') {
            xycopy(f);
        }
    }
    for (const f of xyGen5) {
        xycopy(f);
    }
    manifest.write('xy/manifest.json');
});

// xyicons/: trimmed gen6 minisprites.

const xyIcons = gen6Trimmed();

deploy(ctx => {
    const manifest = new Manifest(ctx);
    for (const f of xyIcons) {
        spritecopy(manifest, f, {dir: 'xyicons'});
    }
    manifest.write('xyicons/manifest.json');
});

// Deprecated, unstamped sets:
// const xyItems = itemTrimmed();       (rules/minisprites.ts)
// const fb = fbSprites();              (rules/social.ts)
// const twitter = twitterSprites();    (rules/social.ts)
//
// deploy(ctx => {
//     for (const f of xyItems) {
//         itemspritecopy(?, f, {dir: "xyitems"});
//     }
//     for (const f of fb) {
//         spritecopy(?, f, {dir: "fbsprites/xy"});
//     }
//     for (const f of twitter) {
//         spritecopy(?, f, {dir: "twittersprites/xy"});
//     }
// });
