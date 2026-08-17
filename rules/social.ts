
import {forEachRule, memo} from '../tools/build/artifact.ts';
import {PNG_DETERMINISTIC, base, compresspng, spriteglob} from '../tools/build/helpers.ts';

// Smogdex social images: models, backfilled with gen9 species not yet in
// models (first source wins).

const socialInputs = memo(() => {
    const social = spriteglob(["src/models/*"], {b: false, s: false});
    const socialSeen = new Set(social.map(base));
    for (const file of spriteglob(["src/gen9species/*"], {b: false, s: false})) {
        if (!socialSeen.has(base(file))) {
            social.push(file);
            socialSeen.add(base(file));
        }
    }
    return social;
});

export const fbSprites = memo(() => forEachRule(socialInputs(), {
    display: "fbsprite %f",
    cmds: [
        `magick convert "%f[0]" ${PNG_DETERMINISTIC} -trim -resize 150x150 -background white -gravity center -extent 198x198 -bordercolor black -border 1 %o`,
        compresspng({config: "MODELS"}),
    ],
}, "%B.png"));

export const twitterSprites = memo(() => forEachRule(socialInputs(), {
    display: "twittersprite %f",
    cmds: [
        `magick convert "%f[0]" ${PNG_DETERMINISTIC} -trim -resize 115x115 -background white -gravity center -extent 120x120 %o`,
        compresspng({config: "MODELS"}),
    ],
}, "%B.png"));
