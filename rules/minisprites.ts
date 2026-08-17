
import {forEachRule, memo} from '../tools/build/artifact.ts';
import {compresspng, pad, trimimg} from '../tools/build/helpers.ts';

// Uniform size minisprites

export const gen6Padded = memo(() => forEachRule("src/minisprites/pokemon/gen6/*.png", {
    display: "pad g6 minisprite %f",
    cmds: [pad({w: 40, h: 30}), compresspng({config: "MINISPRITE"})],
}, "%b"));

export const itemPadded = memo(() => forEachRule("src/minisprites/items/*.png", {
    display: "pad item minisprite %f",
    cmds: [pad({w: 24, h: 24}), compresspng({config: "MINISPRITE"})],
}, "%b"));

export const gen6Trimmed = memo(() => forEachRule("src/minisprites/pokemon/gen6/*.png", {
    display: "trim g6 minisprite %f",
    cmds: [trimimg(), compresspng({config: "MINISPRITE"})],
}, "%b"));

export const itemTrimmed = memo(() => forEachRule("src/minisprites/items/*.png", {
    display: "trim item minisprite %f",
    cmds: [trimimg(), compresspng({config: "MINISPRITE"})],
}, "%b"));
