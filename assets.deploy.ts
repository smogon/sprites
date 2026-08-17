
import {gen6Padded, itemPadded} from './rules/minisprites.ts';
import {Manifest, itemspritecopy, newspritecopy, spritecopy} from './rules/publish.ts';
import {forEachRule, rule} from './tools/build/artifact.ts';
import {spriteglob} from './tools/build/helpers.ts';
import {defineDeploy} from './tools/deploy/api.ts';

// Smogdex minisprites (webp)

const minispriteInputs = spriteglob(["src/minisprites/pokemon/gen6/*", "src/minisprites/items/*"], {a: false});

const webpMinisprites = forEachRule(minispriteInputs, {
    display: "webp minisprite %f",
    cmds: ["cwebp -z 9 %f -o %o"],
}, "%B.webp");

// Smogdex spritesheet. The sheet tool bakes sprite ids parsed from the %f
// filenames into the css, hence nameSensitive.

const [sheetPng, sheetCss] = rule(minispriteInputs, {
    display: "smogdex sheet",
    nameSensitive: true,
    deps: [
        "data/species.json",
        "data/items.json",
        "data/lib/index.ts",
        "lib/root/index.ts",
        "tools/smogdexspritesheet/index.ts",
    ],
    cmds: ["node tools/smogdexspritesheet/index.ts --image %o1 --stylesheet %o2 -- %f"],
}, ["spritesheet.png", "spritesheet.css"]);

const sheetWebp = rule(sheetPng, ["cwebp -z 9 %f -o %o"], "spritesheet.webp");

// Forumsprites sources. Rules must be declared at import time (the build
// runs before finish), so these calls cannot live inside finish().
const forumItems = itemPadded();
const forumG6 = gen6Padded();

export default defineDeploy({
    finish(ctx) {
        // The upload contract wants __key first in the tar, naming the asset
        // set; the tar packer emits ops in queue order, so it has to be the
        // first op.
        ctx.write("__key", "sprites");

        // Dex spritesheet assets: hash-stamped css + webp. The css suffix
        // pointer rides in __meta/ for the dex to read.
        {
            const wh = ctx.hash(sheetWebp);
            ctx.copy(sheetWebp, `spritesheet-${wh}.webp`);
            const src = ctx.read(sheetCss);
            const css = src.replaceAll('url("./spritesheet.webp")', `url("./spritesheet-${wh}.webp")`);
            if (css === src) {
                throw new Error("spritesheet.css: no webp urls rewritten");
            }
            // Suffix from source content: the rewritten css is a pure function
            // of (css, webp), so this changes exactly when the served bytes
            // change.
            const ch = ctx.hash(sheetCss, sheetWebp);
            ctx.write(`spritesheet-${ch}.css`, css);
            ctx.write("__meta/spritesheet_css_suffix.txt", `-${ch}\n`);
        }

        {
            const h = ctx.hash(...webpMinisprites);
            for (const f of webpMinisprites) {
                newspritecopy(ctx, f, {dir: "minisprites/" + h});
            }
            ctx.write("__meta/minisprites-hash.txt", h);
        }

        {
            const manifest = new Manifest(ctx);
            for (const f of forumItems) {
                itemspritecopy(manifest, f, {dir: "forumsprites"});
            }
            for (const f of forumG6) {
                spritecopy(manifest, f, {dir: "forumsprites"}, true);
            }
            manifest.write("__meta/forumsprites/manifest.json");
        }

        {
            const manifest = new Manifest(ctx);
            for (const f of ctx.list("src/pmd")) {
                spritecopy(manifest, f, {dir: "pmd"});
            }
            manifest.write("__meta/pmd/manifest.json");
        }
    },
});
