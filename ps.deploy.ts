
import * as spritedata from '@smogon/sprite-data/index.ts';

import {gen10Modelslike, gen5Gifs} from './rules/modelslike.ts';
import {type Sprite, toPSID} from './rules/publish.ts';
import {forEachRule, memo, rule} from './tools/build/artifact.ts';
import {PNG_DETERMINISTIC, base, compresspng, pad, spriteglob} from './tools/build/helpers.ts';
import {type DeployCtx, defineDeploy} from './tools/deploy/api.ts';

// PS spritesheets. The sheet tools readdir the minisprite dirs and resolve
// ids through the sprite data, baking input names into the sheet layout,
// hence nameSensitive.

const sheetDeps = [
    "data/species.json",
    "data/items.json",
    "data/lib/index.ts",
    "lib/root/index.ts",
    "tools/sheet/index.ts",
];

rule("ps-pokemon.sheet.mjs", {
    display: "ps pokemon sheet",
    nameSensitive: true,
    deps: ["src/minisprites/pokemon/gen6/*", ...sheetDeps],
    cmds: ["node tools/sheet/index.ts %f %o", compresspng({config: "SPRITESHEET"})],
}, ["pokemonicons-sheet.png"]);

// TODO: reenable when trainers are moved
// rule("ps-trainers.sheet.mjs", {
//     display: "ps trainers sheet",
//     nameSensitive: true,
//     cmds: ["node tools/sheet/index.ts %f %o", compresspng({config: "SPRITESHEET"})],
// }, ["trainers-sheet.png"]);

rule("ps-items.sheet.mjs", {
    display: "ps items sheet",
    nameSensitive: true,
    deps: ["src/minisprites/items/*", ...sheetDeps],
    cmds: ["node tools/sheet/index.ts %f %o", compresspng({config: "SPRITESHEET"})],
}, ["itemicons-sheet.png"]);

// PS pokeball icons; input order is the sheet order.

rule([
    "src/_uncategorized/noncanonical/ui/battle/Ball-Normal.png",
    "src/_uncategorized/noncanonical/ui/battle/Ball-Sick.png",
    "src/_uncategorized/noncanonical/ui/battle/Ball-Null.png",
], {
    display: "pokemonicons-pokeball-sheet",
    cmds: [
        `magick convert ${PNG_DETERMINISTIC} -background transparent -gravity center -extent 40x30 %f +append %o`,
        compresspng({config: "SPRITESHEET"}),
    ],
}, ["pokemonicons-pokeball-sheet.png"]);

// Padded Dex, plus missing CAPs backfilled from the gen5/model gifs.

const paddedDex = memo(() => {
    const dex = forEachRule("src/dex/*", {
        display: "pad dex %f",
        cmds: [pad({w: 120, h: 120}), compresspng({config: "DEX"})],
    }, "%b");

    const dexSet = new Set(dex.map(base));
    const dexMissing = [];
    for (const file of spriteglob(["src/sprites/gen5/*.gif", "src/models/*.gif"], {b: false, s: false})) {
        if (!dexSet.has(base(file))) {
            dexMissing.push(file);
            dexSet.add(base(file));
        }
    }

    return dex.concat(forEachRule(dexMissing, {
        display: "missing dex %B",
        cmds: [
            `magick convert "%f[0]" ${PNG_DETERMINISTIC} -trim %o`,
            `magick mogrify ${PNG_DETERMINISTIC} -background transparent -gravity center -resize "120x120>" -extent 120x120 %o`,
            compresspng({config: "DEX"}),
        ],
    }, "%B.png"));
});
paddedDex();

const aniChampions = gen10Modelslike();
gen5Gifs();

// PS ids keep the forme dash, unlike the smogon aliases.
function psSpritecopy(ctx : DeployCtx, f : Sprite, dir : string) : void {
    const sn = spritedata.parseFilename(f.name);
    let name : string;

    // Skip asymmetrical for now
    if (sn.extra.has("a") || sn.extra.has("b") || sn.extra.has("s")) {
        return;
    }

    if (sn.extension) {
        // Skip this, we don't use Unknown/Substitute
        return;
    }
    const sd = spritedata.get(sn.id);
    if (sd.type !== 'specie') {
        throw new Error(`Not a specie sprite: ${f.name}`);
    }
    name = toPSID(sd.base);
    if (sd.forme) {
        name += `-${toPSID(sd.forme)}`;
    }
    if (sn.extra.has("f")) {
        name += "-f";
    }
    if (sn.extra.has("g")) {
        name += "-gmax";
    }

    if (f.ext === null) {
        throw new Error(`Sprite ${f.name} has no extension`);
    }
    ctx.copy(f, `${dir}/${name}.${f.ext}`);
}

export default defineDeploy({
    finish(ctx) {
        const seenModels = new Set<string>();

        for (const f of ctx.list("src/models")) {
            seenModels.add(f.name);
            psSpritecopy(ctx, f, "ani");
        }

        for (const f of aniChampions) {
            if (seenModels.has(f.name)) {
                continue;
            }
            seenModels.add(f.name);
            psSpritecopy(ctx, f, "ani");
        }

        // TODO: ship the padded dex, sheets, trainers, types/categories when
        // the PS deploy is revived; the rules above keep them building.
    },
});
