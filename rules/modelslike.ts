
import {type Artifact, forEachRule} from '../tools/build/artifact.ts';

// Gen 9

export function gen9Modelslike() : Artifact[] {
    return forEachRule("src/gen9species/*.png", {
        display: "96x96 %f",
        // TODO, add customizable compression for gif
        // ... or investigate using webp instead of both png/gif here
        cmds: [
            "magick convert %f -trim +repage -resize 90x90 %o",
            "gifsicle -O3 -b %o",
        ],
    }, "%B.gif");
}

// Gen 10

export function gen10Modelslike() : Artifact[] {
    return forEachRule("src/champions/*.png", {
        display: "96x96 %f",
        // TODO, add customizable compression for gif
        // ... or investigate using webp instead of both png/gif here
        cmds: [
            "magick convert %f -trim +repage -resize 90x90 %o",
            "gifsicle -O3 -b %o",
        ],
    }, "%B.gif");
}

// Gen 5 CAPs...

export function gen5Gifs() : Artifact[] {
    return forEachRule("src/sprites/gen5/*.png", [
        // TODO, add customizable compression for gif
        // ... or investigate using webp instead of both png/gif here
        "magick convert %f %o",
        "gifsicle -O3 -b %o",
    ], "%B.gif");
}
