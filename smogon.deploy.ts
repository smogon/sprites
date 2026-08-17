
import {gen6Trimmed, itemTrimmed} from './rules/minisprites.ts';
import {gen10Modelslike, gen5Gifs, gen9Modelslike} from './rules/modelslike.ts';
import {itemspritecopy, type Manifest, type Sprite, spritecopy, writeManifest} from './rules/publish.ts';
import {fbSprites, twitterSprites} from './rules/social.ts';
import {defineDeploy} from './tools/deploy/api.ts';

const xyModels = gen9Modelslike();
const xyChampions = gen10Modelslike();
const xyGen5 = gen5Gifs();
const xyIcons = gen6Trimmed();
const xyItems = itemTrimmed();
const fb = fbSprites();
const twitter = twitterSprites();

export default defineDeploy({
    finish(ctx) {
        // xy/ animations: first source wins per sprite name.
        const seenModels = new Set<string>();
        const xyManifest : Manifest = {};
        const xycopy = (f : Sprite) => {
            if (seenModels.has(f.name)) {
                return;
            }
            seenModels.add(f.name);
            spritecopy(ctx, f, {dir: "xy"}, false, xyManifest);
        };

        for (const f of ctx.list("src/models")) {
            xycopy(f);
        }
        for (const f of xyModels) {
            xycopy(f);
        }
        for (const f of xyChampions) {
            xycopy(f);
        }
        // Non-model CAPs
        for (const f of ctx.list("src/sprites/gen5")) {
            if (f.ext === 'gif') {
                xycopy(f);
            }
        }
        for (const f of xyGen5) {
            xycopy(f);
        }
        writeManifest(ctx, "xy/manifest.json", xyManifest);

        {
            const manifest : Manifest = {};
            for (const f of xyIcons) {
                spritecopy(ctx, f, {dir: "xyicons"}, false, manifest);
            }
            writeManifest(ctx, "xyicons/manifest.json", manifest);
        }

        for (const f of xyItems) {
            itemspritecopy(ctx, f, {dir: "xyitems"});
        }

        for (const f of fb) {
            spritecopy(ctx, f, {dir: "fbsprites/xy"});
        }

        for (const f of twitter) {
            spritecopy(ctx, f, {dir: "twittersprites/xy"});
        }
    },
});
