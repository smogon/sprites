
import * as pathlib from 'node:path';
import {createHash} from 'node:crypto';

import {astable, glob} from './helpers.ts';
import * as subst from './subst.ts';

// A rule's output: content-addressed bytes with a nominal name. The nominal
// name exists for provenance, inspection, and deploy-time naming; it is NOT
// part of the rule's identity, so renaming an output (or its source) never
// rebuilds anything. The digest is resolved by the executor (from the store
// on a clean hit, or by running the rule).
export class Artifact {
    readonly name: string;         // nominal basename sans ext ("abra", "spritesheet")
    readonly ext: string;          // "png", "gif", ... (no dot)
    readonly decl: RuleDecl;
    readonly index: number;        // position among decl.outputs
    private digest: string | null = null;

    constructor(name: string, ext: string, decl: RuleDecl, index: number) {
        this.name = name;
        this.ext = ext;
        this.decl = decl;
        this.index = index;
    }

    get filename(): string {
        return `${this.name}.${this.ext}`;
    }

    // The producing rule's source-path inputs (provenance).
    get sources(): string[] {
        return this.decl.inputs.filter(i => typeof i === 'string');
    }

    get hash(): string {
        if (this.digest === null) {
            throw new Error(`Artifact ${this.filename} has not been built yet`);
        }
        return this.digest;
    }

    resolve(digest: string): void {
        if (this.digest !== null && this.digest !== digest) {
            throw new Error(`Artifact ${this.filename} resolved twice with different digests`);
        }
        this.digest = digest;
    }
}

export type Input = string | Artifact;   // string = source path relative to repo root

export interface CmdSpec {
    display?: string;
    // Tracked-but-not-substituted inputs: part of rule identity, but never
    // expanded into %f. Use for files a tool reads on its own (e.g.
    // tools/sheet readdirs the minisprite directories).
    deps?: Input | Input[];
    // IMPORTANT: set this on any rule whose output BYTES depend on input
    // NAMES (a tool that readdirs, or parses ids out of %f filenames, e.g.
    // the spritesheet builders). Identity is normally content-only, so
    // without this flag a same-bytes rename would leave the output stale.
    nameSensitive?: boolean;
    cmds: subst.Cmd[];
}

export interface RuleDecl {
    id: number;                    // registration order; identity for artifact inputs
    inputs: Input[];               // ordered (%f order; some rules are order-sensitive)
    deps: Input[];
    outputs: Artifact[];
    cmds: string[];                // flattened PRE-substitution templates
    display: string | null;        // nominally substituted; cosmetic
    displayTemplate: string | null;  // pre-substitution; groups forEach rules
    nameSensitive: boolean;
}

let decls: RuleDecl[] = [];
// Declaring an identical rule twice returns the existing artifacts, so
// shared rule sets are plain functions that any number of deploys may call.
let declIndex = new Map<string, RuleDecl>();

export function getDecls(): RuleDecl[] {
    return decls;
}

export function resetDecls(): void {
    decls = [];
    declIndex = new Map();
}

// Nominal path of an input, for %b/%B and displays.
function nominal(i: Input): string {
    return typeof i === 'string' ? i : i.filename;
}

function extOf(i: Input): string {
    return typeof i === 'string' ? pathlib.extname(i) : `.${i.ext}`;
}

function pathOrThrow(i: Input, what: string): string {
    if (typeof i !== 'string') {
        throw new Error(`nameSensitive rules with artifact ${what} are not yet supported`);
    }
    return i;
}

// Rule identity. Input paths are deliberately excluded (unless
// nameSensitive): identity is the computation and the bytes it consumes, so
// source renames and byte-identical duplicates dedupe for free. Output exts
// are included because tools pick output formats from extensions; nominal
// names are not.
export function computeKey(decl: RuleDecl, digestOf: (i: Input) => string): string {
    let h = createHash('sha256');
    h.update([
        'v2',
        // \0, not \n: a single multi-line command executes differently from
        // the same lines as separate ' && '-joined commands.
        decl.cmds.join('\0'),
        decl.inputs.map(digestOf).join('\0'),
        decl.inputs.map(extOf).join('\0'),
        decl.deps.map(digestOf).join('\0'),
        decl.outputs.map(o => o.ext).join('\0'),
        ...(decl.nameSensitive
            ? [[...decl.inputs, ...decl.deps].map(i => pathOrThrow(i, 'inputs')).join('\0')]
            : []),
    ].join('\x01'));
    return h.digest('hex');
}

function normalizeSpec(spec: CmdSpec | subst.Cmd[]): CmdSpec {
    return Array.isArray(spec) ? {cmds: spec} : spec;
}

// Glob string patterns; artifacts pass through. Order is preserved.
function resolveInputs(input: Input | Input[] | undefined): Input[] {
    let list = input === undefined ? [] : Array.isArray(input) ? input : [input];
    return list.flatMap((i): Input[] => typeof i === 'string' ? glob(i) : [i]);
}

function makeDecl(inputs: Input[], deps: Input[], spec: CmdSpec, outputs: string[]): RuleDecl {
    let nominalInputs = inputs.map(nominal);
    // %b/%B expand to nominal input names, never CAS paths, so they are
    // resolved at declaration. This also lands them in the identity key: a
    // command embedding input names is name-dependent by construction.
    let cmds = subst.flattenCmds(spec.cmds).map(c => subst.substituteNames(c, nominalInputs));
    if (cmds.length === 0) {
        throw new Error(`Rule with no commands (outputs: ${outputs.join(' ')})`);
    }
    if (outputs.length === 0) {
        throw new Error(`Rule with no outputs (cmds: ${cmds[0]!})`);
    }

    // An identical declaration returns the already-registered rule. Artifact
    // inputs are keyed by their producing rule's id, so chains dedupe too.
    let token = (i: Input) => typeof i === 'string' ? `s:${i}` : `a:${i.decl.id}:${i.index}`;
    let identity = [
        cmds.join('\0'),
        inputs.map(token).join('\0'),
        deps.map(token).join('\0'),
        outputs.join('\0'),
        spec.display ?? '',
        spec.nameSensitive ? '1' : '0',
    ].join('\x01');
    let existing = declIndex.get(identity);
    if (existing !== undefined) {
        return existing;
    }

    let decl: RuleDecl = {
        id: decls.length,
        inputs,
        deps,
        outputs: [],
        cmds,
        display: null,
        displayTemplate: spec.display ?? null,
        nameSensitive: spec.nameSensitive ?? false,
    };
    if (decl.nameSensitive) {
        for (let i of [...inputs, ...deps]) {
            pathOrThrow(i, 'inputs');
        }
    }
    outputs.forEach((out, index) => {
        if (out.includes('/') || out.includes('%')) {
            throw new Error(`Rule outputs are nominal filenames, no paths or substitutions: ${out}`);
        }
        if (/[\s'"\\]/.test(out)) {
            // Output names are substituted into shell commands unquoted.
            throw new Error(`Rule output name has shell-hostile characters: ${out}`);
        }
        if (outputs.indexOf(out) !== index) {
            throw new Error(`Duplicate rule output: ${out}`);
        }
        let ext = pathlib.extname(out);
        if (ext === '' || ext === '.') {
            throw new Error(`Rule output needs an extension: ${out}`);
        }
        decl.outputs.push(new Artifact(subst.basenameNoExt(out), ext.slice(1), decl, index));
    });
    // Validate substitutions now (unknown escapes, out-of-range %oN) rather
    // than at execution; the results are discarded.
    let nominalOutputs = decl.outputs.map(o => o.filename);
    for (let cmd of cmds) {
        subst.substitute(cmd, nominalInputs, nominalOutputs);
    }
    if (spec.display !== undefined) {
        decl.display = subst.substitute(spec.display, nominalInputs, nominalOutputs);
    }
    decls.push(decl);
    declIndex.set(identity, decl);
    return decl;
}

// One Artifact per declared output, as a tuple when the output list is a
// literal, so `let [png, css] = rule(...)` needs no undefined checks. A
// single string output returns its Artifact directly.
export function rule(input: Input | Input[], spec: CmdSpec | subst.Cmd[],
                     output: string): Artifact;
export function rule<const T extends readonly string[]>(
    input: Input | Input[], spec: CmdSpec | subst.Cmd[],
    output: T): {[K in keyof T]: Artifact};
export function rule(input: Input | Input[], spec: CmdSpec | subst.Cmd[],
                     output: string | readonly string[]): Artifact | Artifact[] {
    let s = normalizeSpec(spec);
    let decl = makeDecl(resolveInputs(input), resolveInputs(s.deps), s, astable(output));
    return typeof output === 'string' ? decl.outputs[0]! : decl.outputs;
}

export function forEachRule(input: Input | Input[], spec: CmdSpec | subst.Cmd[],
                            output: string): Artifact[] {
    let s = normalizeSpec(spec);
    if (/%[fo]/.test(output)) {
        throw new Error(`forEachRule output template may only use %b/%B: ${output}`);
    }
    let deps = resolveInputs(s.deps);
    let outputs = [];
    for (let file of resolveInputs(input)) {
        let decl = makeDecl([file], deps, s, [subst.substitute(output, [nominal(file)], [])]);
        outputs.push(...decl.outputs);
    }
    return outputs;
}
