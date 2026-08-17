
import pathlib from 'path';
import {createHash} from 'crypto';

import {astable, glob} from './helpers.ts';
import {type Cmd, flattenCmds, substitute} from './subst.ts';

export type {Cmd};
export {base, compresspng, getconfig, glob, pad, setConfig,
        spritedata, spriteglob, trimimg, type SpriteData} from './helpers.ts';

export interface CmdSpec {
    display? : string;
    // Tracked-but-not-substituted inputs: hashed and part of rule identity,
    // but never expanded into %f. Use for files a tool reads on its own
    // (e.g. tools/sheet readdirs the minisprite directories).
    deps? : string | string[];
    cmds : Cmd[];
}

export interface RuleDecl {
    inputs : string[];          // %f source, ordered
    deps : string[];            // hashed, never substituted
    outputs : string[];         // post-substitution paths
    command : string;           // final ' && '-joined shell command
    display : string | null;    // post-substitution; cosmetic, not part of identity
    template : string;          // pre-substitution cmds + output basename template(s)
    key : string;               // identity for incremental skip
}

let rules : RuleDecl[] = [];

export function getRules() : RuleDecl[] {
    return rules;
}

export function resetRules() : void {
    rules = [];
}

function normalizeSpec(spec : CmdSpec | Cmd[]) : CmdSpec {
    return Array.isArray(spec) ? {cmds: spec} : spec;
}

// The rename-detection template deliberately excludes output directories
// (basename only) so that content-preserving moves across directories with
// identical processing still match. Input extensions are included because
// tools like magick pick their output format from file extensions, so an
// extension-only rename must not match.
function templateOf(cmds : string[], outputTemplates : string[], inputs : string[]) : string {
    return [
        cmds.join('\n'),
        outputTemplates.map(t => pathlib.basename(t)).join('\0'),
        inputs.map(p => pathlib.extname(p)).join('\0'),
    ].join('\x01');
}

function keyOf(command : string, inputs : string[], deps : string[], outputs : string[]) : string {
    const h = createHash('sha256');
    h.update([command, inputs.join('\0'), deps.join('\0'), outputs.join('\0')].join('\x01'));
    return h.digest('hex');
}

function makeRule(inputs : string[], deps : string[], spec : CmdSpec,
                  outputs : string[], outputTemplates : string[]) : RuleDecl {
    const cmds = flattenCmds(spec.cmds).map(c => substitute(c, inputs, outputs));
    if (cmds.length === 0) {
        throw new Error(`Rule with no commands (outputs: ${outputs.join(' ')})`);
    }
    const command = cmds.join(' && ');
    const decl : RuleDecl = {
        inputs,
        deps,
        outputs,
        command,
        display: spec.display !== undefined ? substitute(spec.display, inputs, outputs) : null,
        template: templateOf(flattenCmds(spec.cmds), outputTemplates, inputs),
        key: keyOf(command, inputs, deps, outputs),
    };
    rules.push(decl);
    return decl;
}

export function rule(input : string | string[], spec : CmdSpec | Cmd[],
                     output : string | string[]) : string[] {
    const s = normalizeSpec(spec);
    const outputs = astable(output);
    for (const out of outputs) {
        if (out.includes('%')) {
            throw new Error(`rule() outputs are literal paths, no substitutions: ${out}`);
        }
    }
    const decl = makeRule(glob(input), glob(astable(s.deps)), s, outputs, outputs);
    return decl.outputs;
}

export function forEachRule(input : string | string[], spec : CmdSpec | Cmd[],
                            output : string) : string[] {
    const s = normalizeSpec(spec);
    if (/%[fo]/.test(output)) {
        throw new Error(`forEachRule output template may only use %b/%B: ${output}`);
    }
    const deps = glob(astable(s.deps));
    const outputs = [];
    for (const file of glob(input)) {
        const decl = makeRule([file], deps, s, [substitute(output, [file], [])], [output]);
        outputs.push(...decl.outputs);
    }
    return outputs;
}
