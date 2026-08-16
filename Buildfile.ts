
import {base, compresspng, forEachRule, pad, rule, spriteglob, trimimg} from './tools/build/api.ts';

// Generate uniform size minisprites

forEachRule("src/minisprites/pokemon/gen6/*.png", {
    display: "pad g6 minisprite %f",
    cmds: [pad({w: 40, h: 30}), compresspng({config: "MINISPRITE"})],
}, "build/gen6-minisprites-padded/%b");

forEachRule("src/minisprites/items/*.png", {
    display: "pad item minisprite %f",
    cmds: [pad({w: 24, h: 24}), compresspng({config: "MINISPRITE"})],
}, "build/item-minisprites-padded/%b");

forEachRule("src/minisprites/pokemon/gen6/*.png", {
    display: "trim g6 minisprite %f",
    cmds: [trimimg(), compresspng({config: "MINISPRITE"})],
}, "build/gen6-minisprites-trimmed/%b");

forEachRule("src/minisprites/items/*.png", {
    display: "trim item minisprite %f",
    cmds: [trimimg(), compresspng({config: "MINISPRITE"})],
}, "build/item-minisprites-trimmed/%b");

// Gen 9

forEachRule("src/gen9species/*.png", {
    display: "96x96 %f",
    // TODO, add customizable compression for gif
    // ... or investigate using webp instead of both png/gif here
    cmds: [
        "magick convert %f -trim +repage -resize 90x90 %o",
        "gifsicle -O3 -b %o",
    ],
}, "build/gen9-modelslike/%B.gif");

// Gen 10

forEachRule("src/champions/*.png", {
    display: "96x96 %f",
    // TODO, add customizable compression for gif
    // ... or investigate using webp instead of both png/gif here
    cmds: [
        "magick convert %f -trim +repage -resize 90x90 %o",
        "gifsicle -O3 -b %o",
    ],
}, "build/gen10-modelslike/%B.gif");

// Gen 5 CAPs...

forEachRule("src/sprites/gen5/*.png", [
    // TODO, add customizable compression for gif
    // ... or investigate using webp instead of both png/gif here
    "magick convert %f %o",
    "gifsicle -O3 -b %o",
], "build/gen5-gif/%B.gif");

// PS spritesheet

rule("ps-pokemon.sheet.mjs", {
    display: "ps pokemon sheet",
    // The sheet tool reads the minisprites (via readdir, which tup couldn't
    // track) and the sprite data; declare them so changes rebuild the sheet.
    deps: [
        "src/minisprites/pokemon/gen6/*",
        "data/species.json",
        "data/items.json",
        "data/lib/index.ts",
        "lib/root/index.ts",
        "tools/sheet/index.ts",
    ],
    cmds: ["node tools/sheet/index.ts %f %o", compresspng({config: "SPRITESHEET"})],
}, "build/ps/pokemonicons-sheet.png");

// TODO: reenable when trainers are moved
// rule("ps-trainers.sheet.mjs", {
//     display: "ps trainers sheet",
//     cmds: ["node tools/sheet/index.ts %f %o", compresspng({config: "SPRITESHEET"})],
// }, "build/ps/trainers-sheet.png");

rule("ps-items.sheet.mjs", {
    display: "ps items sheet",
    deps: [
        "src/minisprites/items/*",
        "data/species.json",
        "data/items.json",
        "data/lib/index.ts",
        "lib/root/index.ts",
        "tools/sheet/index.ts",
    ],
    cmds: ["node tools/sheet/index.ts %f %o", compresspng({config: "SPRITESHEET"})],
}, "build/ps/itemicons-sheet.png");

// PS pokeball icons

const balls = [
    "src/_uncategorized/noncanonical/ui/battle/Ball-Normal.png",
    "src/_uncategorized/noncanonical/ui/battle/Ball-Sick.png",
    "src/_uncategorized/noncanonical/ui/battle/Ball-Null.png",
];

rule(balls, {
    display: "pokemonicons-pokeball-sheet",
    cmds: [
        "magick convert -background transparent -gravity center -extent 40x30 %f +append %o",
        compresspng({config: "SPRITESHEET"}),
    ],
}, "build/ps/pokemonicons-pokeball-sheet.png");

// Smogdex minisprites (webp)

forEachRule(spriteglob(["src/minisprites/pokemon/gen6/*", "src/minisprites/items/*"], {a: false}), {
    display: "webp minisprite %f",
    cmds: ["cwebp -z 9 %f -o %o"],
}, "build/smogon/minisprites/%B.webp");

// Smogdex spritesheet

rule(spriteglob(["src/minisprites/pokemon/gen6/*", "src/minisprites/items/*"], {a: false}), {
    display: "smogdex sheet",
    deps: [
        "data/species.json",
        "data/items.json",
        "data/lib/index.ts",
        "lib/root/index.ts",
        "tools/smogdexspritesheet/index.ts",
    ],
    // build/smogon/spritesheet.png is an undeclared temporary; it is removed
    // before the rule finishes.
    cmds: [
        "node tools/smogdexspritesheet/index.ts --image build/smogon/spritesheet.png --stylesheet build/smogon/spritesheet.css -- %f",
        "cwebp -z 9 build/smogon/spritesheet.png -o build/smogon/spritesheet.webp",
        "rm build/smogon/spritesheet.png",
    ],
}, ["build/smogon/spritesheet.webp", "build/smogon/spritesheet.css"]);

// Smogdex social images

const social = spriteglob(["src/models/*"], {b: false, s: false});

const socialSeen = new Set(social.map(base));
for (const file of spriteglob(["src/gen9species/*"], {b: false, s: false})) {
    if (!socialSeen.has(base(file))) {
        social.push(file);
        socialSeen.add(base(file));
    }
}

forEachRule(social, {
    display: "fbsprite %f",
    cmds: [
        'magick convert "%f[0]" -trim -resize 150x150 -background white -gravity center -extent 198x198 -bordercolor black -border 1 %o',
        compresspng({config: "MODELS"}),
    ],
}, "build/smogon/fbsprites/xy/%B.png");

forEachRule(social, {
    display: "twittersprite %f",
    cmds: [
        'magick convert "%f[0]" -trim -resize 115x115 -background white -gravity center -extent 120x120 %o',
        compresspng({config: "MODELS"}),
    ],
}, "build/smogon/twittersprites/xy/%B.png");

// Trainers

// TODO: reenable when trainers are moved
// forEachRule("src/canonical/trainers/*", {
//     display: "pad trainer %f",
//     cmds: [pad({w: 80, h: 80}), compresspng({config: "TRAINERS"})],
// }, "build/padded-trainers/canonical/%b");

// Padded Dex

const dexOutput = forEachRule("src/dex/*", {
    display: "pad dex %f",
    cmds: [pad({w: 120, h: 120}), compresspng({config: "DEX"})],
}, "build/padded-dex/%b");

// Build missing CAP dex

const dexSet = new Set(dexOutput.map(base));

const dexMissing = [];
for (const file of spriteglob(["src/sprites/gen5/*.gif", "src/models/*.gif"], {b: false, s: false})) {
    if (!dexSet.has(base(file))) {
        dexMissing.push(file);
        dexSet.add(base(file));
    }
}

forEachRule(dexMissing, {
    display: "missing dex %B",
    cmds: [
        'magick convert "%f[0]" -trim %o',
        'magick mogrify -background transparent -gravity center -resize "120x120>" -extent 120x120 %o',
        compresspng({config: "DEX"}),
    ],
}, "build/padded-dex/%B.png");
