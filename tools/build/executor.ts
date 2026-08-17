
import fs from 'fs';
import pathlib from 'path';

import {type Input, type RuleDecl, computeKey} from './artifact.ts';
import {casInsert, casPath, casStat} from './cas.ts';
import {BuildError} from './errors.ts';
import {runShell} from './exec.ts';
import {type Store} from './store.ts';
import {substitute} from './subst.ts';

export type DirtyReason = 'new' | 'cas-missing';

export type RuleOutcome =
    | {status : 'clean'}                                        // key hit, CAS objects present
    | {status : 'ran', reason : DirtyReason}
    | {status : 'would-run', reason : DirtyReason | 'blocked'}  // dry run
    | {status : 'failed', message : string}
    | {status : 'blocked'};                                     // a producer failed

export interface BuildResult {
    outcomes : Map<RuleDecl, RuleOutcome>;   // no entry = not attempted (aborted)
    keys : Map<RuleDecl, string>;            // only decls whose key resolved
    ok : boolean;                            // every decl clean or ran
}

export interface ExecutorOpts {
    root : string;                           // cwd for commands
    store : Store;
    casDir : string;                         // relative to root (substituted into commands)
    tmpDir : string;
    jobs : number;
    dryRun : boolean;
    failFast : boolean;
    verbose? : boolean;                      // annotate run lines with the dirty reason
    sourceHashes : Map<string, Buffer>;      // every source input/dep, pre-reconciled
    signal : AbortSignal;
    log? : (line : string) => void;
    logError? : (line : string) => void;
}

export function label(decl : RuleDecl) : string {
    return decl.display ?? decl.cmds[0]!;
}

function indent(text : string) : string {
    return text.replace(/\n$/, '').split('\n').map(l => '    ' + l).join('\n');
}

// Sentinels thrown through the demand graph. They carry no message; the
// outcome map is the report.
class RuleFailed extends Error {}
class DryDirty extends Error {}
class Aborted extends Error {}

class Semaphore {
    private available : number;
    private waiters : (() => void)[] = [];

    constructor(n : number) {
        this.available = n;
    }

    async acquire() : Promise<void> {
        if (this.available > 0) {
            this.available--;
            return;
        }
        await new Promise<void>(resolve => this.waiters.push(resolve));
    }

    release() : void {
        const waiter = this.waiters.shift();
        if (waiter !== undefined) {
            waiter();
        } else {
            this.available++;
        }
    }
}

// Demand-driven memoized executor. Each rule's identity key is computable
// only once its artifact inputs have digests, so there is no upfront plan:
// demanding a rule awaits its producers, computes the key, and skips or runs.
// The artifact graph is a DAG by construction (a rule can only reference
// artifacts that already exist as values), so there is no cycle check.
export class Executor {
    private opts : ExecutorOpts;
    private memo = new Map<RuleDecl, Promise<string[]>>();
    private inflightByKey = new Map<string, Promise<string[]>>();
    private outcomes = new Map<RuleDecl, RuleOutcome>();
    private keys = new Map<RuleDecl, string>();
    private semaphore : Semaphore;
    private failAc = new AbortController();
    private runSignal : AbortSignal;
    private counter = 0;
    private tmpSeq = 0;
    private log : (line : string) => void;
    private logError : (line : string) => void;

    constructor(opts : ExecutorOpts) {
        this.opts = opts;
        this.semaphore = new Semaphore(opts.jobs);
        this.runSignal = AbortSignal.any([opts.signal, this.failAc.signal]);
        this.log = opts.log ?? console.log;
        this.logError = opts.logError ?? console.error;
    }

    async build(decls : readonly RuleDecl[]) : Promise<BuildResult> {
        await Promise.allSettled(decls.map(d => this.demand(d)));
        const ok = decls.every(d => {
            const status = this.outcomes.get(d)?.status;
            return status === 'clean' || status === 'ran';
        });
        return {outcomes: this.outcomes, keys: this.keys, ok};
    }

    private demand(decl : RuleDecl) : Promise<string[]> {
        let p = this.memo.get(decl);
        if (p === undefined) {
            // Any non-sentinel escape (a store error, a resolve conflict, a
            // bug) must surface as a reported failure, not vanish into the
            // allSettled in build().
            p = this.demandInner(decl).catch(err => {
                if (err instanceof RuleFailed || err instanceof DryDirty || err instanceof Aborted) {
                    throw err;
                }
                this.outcomes.set(decl, {status: 'failed', message: 'internal error'});
                this.logError(`FAILED (internal error): ${label(decl)}`);
                this.logError(indent(err instanceof Error ? err.stack ?? err.message : String(err)));
                this.failAc.abort();
                throw new RuleFailed();
            });
            this.memo.set(decl, p);
        }
        return p;
    }

    private async digestOf(i : Input) : Promise<string> {
        if (typeof i !== 'string') {
            await this.demand(i.decl);
            return i.hash;
        }
        const hash = this.opts.sourceHashes.get(i);
        if (hash === undefined) {
            throw new BuildError(`No hash for source ${i}`);
        }
        return hash.toString('hex');
    }

    private async demandInner(decl : RuleDecl) : Promise<string[]> {
        let digests : Map<Input, string>;
        try {
            const inputs = [...decl.inputs, ...decl.deps];
            const resolved = await Promise.all(inputs.map(i => this.digestOf(i)));
            digests = new Map(inputs.map((i, n) => [i, resolved[n]!]));
        } catch (err) {
            if (err instanceof RuleFailed) {
                this.outcomes.set(decl, {status: 'blocked'});
            } else if (err instanceof DryDirty) {
                this.outcomes.set(decl, {status: 'would-run', reason: 'blocked'});
                this.log(`would run (blocked by dirty producer): ${label(decl)}`);
            }
            throw err;
        }

        const key = computeKey(decl, i => digests.get(i)!);
        this.keys.set(decl, key);

        // Byte-identical duplicate declarations share one execution.
        const existing = this.inflightByKey.get(key);
        if (existing !== undefined) {
            try {
                const shared = await existing;
                decl.outputs.forEach((o, n) => o.resolve(shared[n]!));
                this.outcomes.set(decl, {status: 'clean'});
                return shared;
            } catch (err) {
                if (err instanceof RuleFailed) {
                    this.outcomes.set(decl, {status: 'blocked'});
                } else if (err instanceof DryDirty) {
                    this.outcomes.set(decl, {status: 'would-run', reason: 'blocked'});
                }
                throw err;
            }
        }
        const work = this.perform(decl, key);
        this.inflightByKey.set(key, work);
        const result = await work;
        decl.outputs.forEach((o, n) => o.resolve(result[n]!));
        return result;
    }

    private async perform(decl : RuleDecl, key : string) : Promise<string[]> {
        const {store, casDir} = this.opts;
        const stored = store.lookupRule(key);
        if (stored !== null
            && stored.length === decl.outputs.length
            && stored.every((o, n) => o.ext === decl.outputs[n]!.ext)
            && stored.every(o => casStat(casDir, o.digest, o.ext) === o.size)) {
            this.outcomes.set(decl, {status: 'clean'});
            return stored.map(o => o.digest);
        }
        const reason : DirtyReason = stored === null ? 'new' : 'cas-missing';

        if (this.opts.dryRun) {
            this.outcomes.set(decl, {status: 'would-run', reason});
            this.log(`would run (${reason}): ${label(decl)}`);
            throw new DryDirty();
        }

        await this.semaphore.acquire();
        try {
            if (this.runSignal.aborted) {
                throw new Aborted();
            }
            return await this.execute(decl, key, reason);
        } finally {
            this.semaphore.release();
        }
    }

    private async execute(decl : RuleDecl, key : string, reason : DirtyReason) : Promise<string[]> {
        const {store, casDir, tmpDir, root} = this.opts;
        const ruleTmp = pathlib.join(tmpDir, String(this.tmpSeq++));
        fs.mkdirSync(ruleTmp, {recursive: true});
        const tempOutputs = decl.outputs.map(o => pathlib.join(ruleTmp, o.filename));
        const concreteInputs = decl.inputs.map(
            i => typeof i === 'string' ? i : casPath(casDir, i.hash, i.ext));
        const command = decl.cmds.map(c => substitute(c, concreteInputs, tempOutputs)).join(' && ');

        try {
            const result = await runShell(command, {cwd: root, signal: this.runSignal});
            if (this.runSignal.aborted && result.code !== 0) {
                throw new Aborted();  // killed by the abort, not a real failure; stays dirty
            }
            if (result.code === 0) {
                const missing = tempOutputs.filter(p => !fs.existsSync(p));
                if (missing.length === 0) {
                    const outputs = decl.outputs.map((o, n) => {
                        const object = casInsert(casDir, tempOutputs[n]!, o.ext);
                        return {digest: object.digest, ext: o.ext, size: object.size};
                    });
                    store.recordRule(key, decl.cmds, outputs);
                    this.outcomes.set(decl, {status: 'ran', reason});
                    this.log(`[${++this.counter}] ${label(decl)}`
                        + (this.opts.verbose ? ` (${reason})` : ''));
                    if (result.output !== '') {
                        this.log(indent(result.output));
                    }
                    return outputs.map(o => o.digest);
                }
                return this.fail(decl, command, result.output,
                    `command succeeded but did not produce: ${missing.map(p => pathlib.basename(p)).join(' ')}`);
            }
            return this.fail(decl, command, result.output, `exit status ${result.code ?? result.signal}`);
        } finally {
            fs.rmSync(ruleTmp, {recursive: true, force: true});
        }
    }

    // Nothing is recorded for a failure: failed and never-ran are the same
    // state, so the rule stays dirty.
    private fail(decl : RuleDecl, command : string, output : string, message : string) : never {
        this.outcomes.set(decl, {status: 'failed', message});
        this.logError(`FAILED: ${label(decl)} (${message})`);
        this.logError(`    command: ${command}`);
        if (output !== '') {
            this.logError(indent(output));
        }
        if (this.opts.failFast) {
            this.failAc.abort();
        }
        throw new RuleFailed();
    }
}
