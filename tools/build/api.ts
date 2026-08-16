
import fs from 'fs';
import pathlib from 'path';
import {createHash} from 'crypto';

import {type Cmd, flattenCmds, substitute, basenameNoExt} from './subst.ts';

export type {Cmd};

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
let config = new Map<string, string>();

export function setConfig(cfg : Map<string, string>) : void {
    config = cfg;
}

export function getRules() : RuleDecl[] {
    return rules;
}

export function resetRules() : void {
    rules = [];
}

export function getconfig(name : string) : string | undefined {
    const value = config.get(name);
    return value === '' ? undefined : value;
}

function astable(x : string | string[] | undefined) : string[] {
    if (x === undefined) {
        return [];
    }
    return typeof x === 'string' ? [x] : x;
}

// Single-directory, single-'*' glob (all Tupfile patterns were of this form).
// Non-glob strings pass through literally; existence is checked at hash time.
// Results are sorted within a pattern; declared order is preserved across
// patterns (some rules, e.g. the pokeball sheet, are input-order-sensitive).
function globOne(pat : string) : string[] {
    if (!pat.includes('*')) {
        return [pat];
    }
    const dir = pathlib.dirname(pat);
    const base = pathlib.basename(pat);
    if (dir.includes('*') || base.indexOf('*') !== base.lastIndexOf('*')) {
        throw new Error(`Unsupported glob pattern: ${pat}`);
    }
    const [prefix, suffix] = base.split('*') as [string, string];
    const results = [];
    for (const ent of fs.readdirSync(dir, {withFileTypes: true})) {
        if (!ent.isFile() && !ent.isSymbolicLink()) {
            continue;
        }
        const name = ent.name;
        if (name.startsWith('.')) {
            continue;  // tup.glob ignored dotfiles
        }
        if (name.length >= prefix.length + suffix.length
            && name.startsWith(prefix) && name.endsWith(suffix)) {
            results.push(dir === '.' ? name : `${dir}/${name}`);
        }
    }
    results.sort();
    return results;
}

export function glob(pats : string | string[]) : string[] {
    return astable(pats).flatMap(globOne);
}

// tup.base: basename without directory or final extension
export function base(path : string) : string {
    return basenameNoExt(path);
}

export interface SpriteData {
    id : string;
    data : Record<string, string | true>;
}

// Port of util/sprites.lua spritedata. Lua used gmatch("[^-]+"), which skips
// empty segments, hence the filter.
export function spritedata(basename : string) : SpriteData {
    const parts = basename.split('-').filter(p => p !== '');
    const data : Record<string, string | true> = {};
    for (const part of parts.slice(1)) {
        if (part.length === 1) {
            data[part] = true;
        } else {
            data[part[0]!] = part.slice(1);
        }
    }
    return {id: parts[0] ?? '', data};
}

export function spriteglob(pats : string | string[], flagspec? : Record<string, unknown>) : string[] {
    return glob(pats).filter(filename => {
        const sd = spritedata(base(filename));
        for (const [k, v] of Object.entries(flagspec ?? {})) {
            if (Boolean(v) !== Boolean(sd.data[k])) {
                return false;
            }
        }
        return true;
    });
}

export function pad(opts : {w : number, h : number, input? : string, output? : string}) : string {
    const input = opts.input ?? '%f';
    const output = opts.output ?? '%o';
    return `magick convert ${input} -background transparent -gravity center -extent ${opts.w}x${opts.h} ${output}`;
}

export function trimimg(opts : {input? : string, output? : string} = {}) : string {
    return `magick convert ${opts.input ?? '%f'} -trim ${opts.output ?? '%o'}`;
}

interface CompressOpts {
    pngquant? : string;
    optipng? : string;
    advpng? : string;
}

function compressopts(program : string, copts : CompressOpts) : void {
    copts.pngquant = getconfig(`${program}_PNGQUANT`) ?? copts.pngquant;
    copts.optipng = getconfig(`${program}_OPTIPNG`) ?? copts.optipng;
    copts.advpng = getconfig(`${program}_ADVPNG`) ?? copts.advpng;
}

export function compresspng(opts : {config? : string, output? : string} = {}) : Cmd[] {
    const output = opts.output ?? '%o';
    const copts : CompressOpts = {};
    compressopts('DEFAULT', copts);
    if (opts.config) {
        compressopts(opts.config, copts);
    }
    const cmds = [];
    if (copts.pngquant !== undefined) {
        // -f -o necessary to overwrite existing file
        cmds.push(`pngquant -f -o ${output} ${copts.pngquant} ${output}`);
    }
    if (copts.optipng !== undefined) {
        cmds.push(`optipng -q ${copts.optipng} ${output}`);
    }
    if (copts.advpng !== undefined) {
        cmds.push(`advpng -q ${copts.advpng} ${output}`);
    }
    return cmds;
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
