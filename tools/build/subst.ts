
import pathlib from 'path';

// A command spec entry: a shell command string, or an arbitrarily nested list
// of them (flattened, like the Lua flatten()).
export type Cmd = string | Cmd[];

export function flattenCmds(cmds : Cmd) : string[] {
    if (typeof cmds === 'string') {
        const trimmed = cmds.trim();
        return trimmed === '' ? [] : [trimmed];
    }
    return cmds.flatMap(flattenCmds);
}

export function basenameNoExt(path : string) : string {
    const base = pathlib.basename(path);
    const dot = base.lastIndexOf('.');
    return dot > 0 ? base.slice(0, dot) : base;
}

// Tup-style substitutions:
//   %f  inputs, space-joined        %b  input basenames
//   %o  outputs, space-joined       %B  input basenames without extension
export function substitute(s : string, inputs : string[], outputs : string[]) : string {
    return s.replace(/%([a-zA-Z])/g, (match, c : string) => {
        switch (c) {
            case 'f': return inputs.join(' ');
            case 'o': return outputs.join(' ');
            case 'b': return inputs.map(p => pathlib.basename(p)).join(' ');
            case 'B': return inputs.map(basenameNoExt).join(' ');
            default: throw new Error(`Unknown substitution ${match} in: ${s}`);
        }
    });
}
