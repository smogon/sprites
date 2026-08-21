
import * as fs from 'node:fs/promises';
import * as pathlib from 'node:path';

import * as artifact from './artifact.ts';
import * as cas from './cas.ts';
import {BuildError} from './errors.ts';
import {runShell} from './exec.ts';
import {type Store} from './store.ts';
import {substitute} from './subst.ts';

export type DirtyReason = 'new' | 'cas-missing';

export type RuleOutcome =
    | {status: 'clean'}                        // key hit, CAS objects present
    | {status: 'ran', reason: DirtyReason}
    | {status: 'would-run', reason: DirtyReason}   // dry run
    | {status: 'failed', message: string};

export type BuildResult = {
    outcomes: Map<artifact.RuleDecl, RuleOutcome>;   // no entry = not attempted (aborted)
    keys: Map<artifact.RuleDecl, string>;            // only decls whose key resolved
    ok: boolean;                            // every decl clean or ran
};

export type ExecutorOpts = {
    root: string;                           // cwd for commands
    store: Store,
    casDir: string;                         // relative to root (outputs land here)
    tmpDir: string,
    jobs: number,
    dryRun: boolean,
    failFast: boolean,
    verbose?: boolean;                      // annotate run lines with the dirty reason
    sourceHashes: Map<string, Buffer>;      // every source input/dep, pre-reconciled
    signal: AbortSignal,
    log?: (line: string) => void,
    logError?: (line: string) => void,
};

export function label(decl: artifact.RuleDecl): string {
    return decl.display ?? decl.cmds[0] ?? '(no commands)';
}

// Parallel-array access: the arrays are constructed the same length, so a
// miss is a bug worth crashing on.
function paired<T>(xs: readonly T[], n: number): T {
    let x = xs[n];
    if (x === undefined) {
        throw new Error('parallel array length mismatch');
    }
    return x;
}

function indent(text: string): string {
    return text.replace(/\n$/, '').split('\n').map(l => '    ' + l).join('\n');
}

// Sentinels. They carry no message; the outcome map is the report.
class RuleFailed extends Error {}
class Aborted extends Error {}

class Semaphore {
    #available: number;
    #waiters: (() => void)[] = [];

    constructor(n: number) {
        this.#available = n;
    }

    async acquire(): Promise<void> {
        if (this.#available > 0) {
            this.#available--;
            return;
        }
        await new Promise<void>(resolve => this.#waiters.push(resolve));
    }

    release(): void {
        let waiter = this.#waiters.shift();
        if (waiter !== undefined) {
            waiter();
        } else {
            this.#available++;
        }
    }
}

// Rules read source files only, so every identity key is computable upfront
// and the rules are independent: this is a flat parallel sweep, no plan and
// no dependency graph. The only coupling is that byte-identical declarations
// share one execution.
export class Executor {
    #opts: ExecutorOpts;
    #inflightByKey = new Map<string, Promise<string[]>>();
    #outcomes = new Map<artifact.RuleDecl, RuleOutcome>();
    #keys = new Map<artifact.RuleDecl, string>();
    #semaphore: Semaphore;
    #failAc = new AbortController();
    #runSignal: AbortSignal;
    #counter = 0;
    #tmpSeq = 0;
    #log: (line: string) => void;
    #logError: (line: string) => void;

    constructor(opts: ExecutorOpts) {
        this.#opts = opts;
        this.#semaphore = new Semaphore(opts.jobs);
        this.#runSignal = AbortSignal.any([opts.signal, this.#failAc.signal]);
        this.#log = opts.log ?? console.log;
        this.#logError = opts.logError ?? console.error;
    }

    async build(decls: readonly artifact.RuleDecl[]): Promise<BuildResult> {
        await Promise.all(decls.map(d => this.#guard(d)));
        let ok = decls.every(d => {
            let status = this.#outcomes.get(d)?.status;
            return status === 'clean' || status === 'ran';
        });
        return {outcomes: this.#outcomes, keys: this.#keys, ok};
    }

    async #guard(decl: artifact.RuleDecl): Promise<void> {
        try {
            await this.#run(decl);
        } catch (err) {
            if (err instanceof RuleFailed || err instanceof Aborted) {
                return;
            }
            // Any other escape (a store error, a resolve conflict, a bug)
            // must surface as a reported failure, not vanish here.
            this.#outcomes.set(decl, {status: 'failed', message: 'internal error'});
            this.#logError(`FAILED (internal error): ${label(decl)}`);
            this.#logError(indent(err instanceof Error ? err.stack ?? err.message : String(err)));
            this.#failAc.abort();
        }
    }

    #digestOf(path: string): string {
        let hash = this.#opts.sourceHashes.get(path);
        if (hash === undefined) {
            throw new BuildError(`No hash for source ${path}`);
        }
        return hash.toString('hex');
    }

    async #run(decl: artifact.RuleDecl): Promise<void> {
        let {store, casDir} = this.#opts;
        let key = artifact.computeKey(decl, p => this.#digestOf(p));
        this.#keys.set(decl, key);

        let stored = store.lookupRule(key);
        if (stored !== null
            && stored.length === decl.outputs.length
            && stored.every((o, n) => o.ext === paired(decl.outputs, n).ext)) {
            let sizes = await Promise.all(stored.map(o => cas.casStat(casDir, o.digest, o.ext)));
            if (stored.every((o, n) => sizes[n] === o.size)) {
                this.#resolve(decl, stored.map(o => o.digest));
                this.#outcomes.set(decl, {status: 'clean'});
                return;
            }
        }
        let reason: DirtyReason = stored === null ? 'new' : 'cas-missing';

        if (this.#opts.dryRun) {
            this.#outcomes.set(decl, {status: 'would-run', reason});
            this.#log(`would run (${reason}): ${label(decl)}`);
            return;
        }

        // Byte-identical duplicate declarations share one execution; the
        // loser adopts the winner's digests and reads as clean.
        let existing = this.#inflightByKey.get(key);
        if (existing !== undefined) {
            try {
                this.#resolve(decl, await existing);
            } catch (err) {
                if (err instanceof RuleFailed) {
                    this.#outcomes.set(decl, {status: 'failed', message: 'byte-identical rule failed'});
                }
                throw err;
            }
            this.#outcomes.set(decl, {status: 'clean'});
            return;
        }
        let work = this.#gated(decl, key, reason);
        this.#inflightByKey.set(key, work);
        this.#resolve(decl, await work);   // #execute already recorded the outcome
    }

    #resolve(decl: artifact.RuleDecl, digests: readonly string[]): void {
        decl.outputs.forEach((o, n) => o.resolve(paired(digests, n)));
    }

    async #gated(decl: artifact.RuleDecl, key: string, reason: DirtyReason): Promise<string[]> {
        await this.#semaphore.acquire();
        try {
            if (this.#runSignal.aborted) {
                throw new Aborted();
            }
            return await this.#execute(decl, key, reason);
        } finally {
            this.#semaphore.release();
        }
    }

    async #execute(decl: artifact.RuleDecl, key: string, reason: DirtyReason): Promise<string[]> {
        let {store, casDir, tmpDir, root} = this.#opts;
        let ruleTmp = pathlib.join(tmpDir, String(this.#tmpSeq++));
        await fs.mkdir(ruleTmp, {recursive: true});
        let tempOutputs = decl.outputs.map(o => pathlib.join(ruleTmp, o.filename));
        let command = decl.cmds.map(c => substitute(c, decl.inputs, tempOutputs)).join(' && ');

        try {
            let result = await runShell(command, {cwd: root, signal: this.#runSignal});
            if (this.#runSignal.aborted && result.code !== 0) {
                throw new Aborted();  // killed by the abort, not a real failure; stays dirty
            }
            if (result.code === 0) {
                let present = await Promise.all(tempOutputs.map(
                    p => fs.access(p).then(() => true, () => false)));
                let missing = tempOutputs.filter((_, n) => !present[n]);
                if (missing.length === 0) {
                    let outputs = [];
                    for (let [n, o] of decl.outputs.entries()) {
                        let object = await cas.casInsert(casDir, paired(tempOutputs, n), o.ext);
                        outputs.push({digest: object.digest, ext: o.ext, size: object.size});
                    }
                    store.recordRule(key, decl.cmds, outputs);
                    this.#outcomes.set(decl, {status: 'ran', reason});
                    this.#log(`[${++this.#counter}] ${label(decl)}`
                        + (this.#opts.verbose ? ` (${reason})` : ''));
                    if (result.output !== '') {
                        this.#log(indent(result.output));
                    }
                    return outputs.map(o => o.digest);
                }
                return this.#fail(decl, command, result.output,
                    `command succeeded but did not produce: ${missing.map(p => pathlib.basename(p)).join(' ')}`);
            }
            return this.#fail(decl, command, result.output, `exit status ${result.code ?? result.signal}`);
        } finally {
            await fs.rm(ruleTmp, {recursive: true, force: true});
        }
    }

    // Nothing is recorded for a failure: failed and never-ran are the same
    // state, so the rule stays dirty.
    #fail(decl: artifact.RuleDecl, command: string, output: string, message: string): never {
        this.#outcomes.set(decl, {status: 'failed', message});
        this.#logError(`FAILED: ${label(decl)} (${message})`);
        this.#logError(`    command: ${command}`);
        if (output !== '') {
            this.#logError(indent(output));
        }
        if (this.#opts.failFast) {
            this.#failAc.abort();
        }
        throw new RuleFailed();
    }
}
