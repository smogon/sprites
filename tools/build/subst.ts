
import pathlib from 'path';

// A command spec entry: a shell command string, or an arbitrarily nested list
// of them (flattened, like the Lua flatten()).
export type Cmd = string | Cmd[];

export function flattenCmds(cmds: Cmd): string[] {
    if (typeof cmds === 'string') {
        const trimmed = cmds.trim();
        return trimmed === '' ? [] : [trimmed];
    }
    return cmds.flatMap(flattenCmds);
}

export function basenameNoExt(path: string): string {
    const base = pathlib.basename(path);
    const dot = base.lastIndexOf('.');
    return dot > 0 ? base.slice(0, dot) : base;
}

// Expand only the name substitutions (%b/%B). They are static per rule, so
// declarations expand them eagerly; %f/%o/%oN wait for execution, when
// concrete paths exist.
export function substituteNames(s: string, inputs: string[]): string {
    return s.replace(/%([bB])/g, (_, c: string) =>
        c === 'b' ? inputs.map(p => pathlib.basename(p)).join(' ')
                  : inputs.map(basenameNoExt).join(' '));
}

// Tup-style substitutions:
//   %f  inputs, space-joined        %b  input basenames
//   %o  outputs, space-joined       %B  input basenames without extension
//   %oN (1-based) a single output, for rules with several
export function substitute(s: string, inputs: string[], outputs: string[]): string {
    return s.replace(/%o(\d+)|%([a-zA-Z])/g, (match, n: string | undefined, c: string | undefined) => {
        if (n !== undefined) {
            const i = Number(n);
            if (i < 1 || i > outputs.length) {
                throw new Error(`Output index out of range (${outputs.length} outputs): ${match} in: ${s}`);
            }
            return outputs[i - 1]!;
        }
        switch (c) {
            case 'f': return inputs.join(' ');
            case 'o': return outputs.join(' ');
            case 'b': return inputs.map(p => pathlib.basename(p)).join(' ');
            case 'B': return inputs.map(basenameNoExt).join(' ');
            default: throw new Error(`Unknown substitution ${match} in: ${s}`);
        }
    });
}
