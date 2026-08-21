
import {type Artifact, forEachRule} from '../tools/build/artifact.ts';

// Shared by the smogon xy/ set and the PS ani/ set.

export function gen10Modelslike(): Artifact[] {
    return forEachRule('src/champions/*.png', {
        display: '96x96 %f',
        // TODO, add customizable compression for gif
        // ... or investigate using webp instead of both png/gif here
        cmds: [
            'magick convert %f -trim +repage -resize 90x90 %o',
            'gifsicle -O3 -b %o',
        ],
    }, '%B.gif');
}
