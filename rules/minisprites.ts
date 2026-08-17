
import {type Artifact, forEachRule} from '../tools/build/artifact.ts';
import {compresspng, pad, trimimg} from '../tools/build/helpers.ts';

// Uniform size minisprites

export function gen6Padded(): Artifact[] {
    return forEachRule('src/minisprites/pokemon/gen6/*.png', {
        display: 'pad g6 minisprite %f',
        cmds: [pad({w: 40, h: 30}), compresspng({config: 'MINISPRITE'})],
    }, '%b');
}

export function itemPadded(): Artifact[] {
    return forEachRule('src/minisprites/items/*.png', {
        display: 'pad item minisprite %f',
        cmds: [pad({w: 24, h: 24}), compresspng({config: 'MINISPRITE'})],
    }, '%b');
}

export function gen6Trimmed(): Artifact[] {
    return forEachRule('src/minisprites/pokemon/gen6/*.png', {
        display: 'trim g6 minisprite %f',
        cmds: [trimimg(), compresspng({config: 'MINISPRITE'})],
    }, '%b');
}

export function itemTrimmed(): Artifact[] {
    return forEachRule('src/minisprites/items/*.png', {
        display: 'trim item minisprite %f',
        cmds: [trimimg(), compresspng({config: 'MINISPRITE'})],
    }, '%b');
}
