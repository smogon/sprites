
import {type RuleDecl} from './artifact.ts';
import {casSweep} from './cas.ts';
import {BuildError} from './errors.ts';
import {type BuildResult, Executor, label} from './executor.ts';
import {reconcileHashes} from './hash.ts';
import {type Store} from './store.ts';

export interface BuildOpts {
    root : string;
    store : Store;
    casDir : string;                 // relative to root; substituted into commands
    tmpDir : string;
    jobs : number;
    dryRun : boolean;
    failFast : boolean;
    verbose : boolean;
    // GC after a fully successful build: drop rules whose key is no longer
    // declared, sweep unreferenced CAS objects, prune the file cache. Only
    // safe when `decls` is the full rule universe (a partial build would GC
    // the other deploys' state), so the CLI sets it for union builds only.
    gc : boolean;
    signal : AbortSignal;
    log? : (line : string) => void;
    logError? : (line : string) => void;
}

export interface DriveResult extends BuildResult {
    interrupted : boolean;
}

export async function build(decls : readonly RuleDecl[], opts : BuildOpts) : Promise<DriveResult> {
    const log = opts.log ?? console.log;
    const logError = opts.logError ?? console.error;
    const {store} = opts;

    // Hash sources over the producer closure: demanding a rule demands the
    // producers of its artifact inputs, even ones outside `decls`.
    const closure = new Set<RuleDecl>();
    const sources = new Set<string>();
    const add = (decl : RuleDecl) => {
        if (closure.has(decl)) {
            return;
        }
        closure.add(decl);
        for (const input of [...decl.inputs, ...decl.deps]) {
            if (typeof input === 'string') {
                sources.add(input);
            } else {
                add(input.decl);
            }
        }
    };
    decls.forEach(add);
    const {hashes, updated, missing} = reconcileHashes(sources, store.loadFileCache());
    if (missing.length > 0) {
        throw new BuildError(`Missing input files:\n  ${missing.slice(0, 20).join('\n  ')}`
            + (missing.length > 20 ? `\n  ... and ${missing.length - 20} more` : ''));
    }
    if (!opts.dryRun && updated.size > 0) {
        store.saveFileCache(updated);
    }

    const executor = new Executor({
        root: opts.root,
        store,
        casDir: opts.casDir,
        tmpDir: opts.tmpDir,
        jobs: opts.jobs,
        dryRun: opts.dryRun,
        failFast: opts.failFast,
        verbose: opts.verbose,
        sourceHashes: hashes,
        signal: opts.signal,
        log,
        logError,
    });
    const result = await executor.build(decls);
    const interrupted = opts.signal.aborted;

    const counts = {clean: 0, ran: 0, 'would-run': 0, failed: 0, blocked: 0};
    for (const decl of decls) {
        const outcome = result.outcomes.get(decl);
        if (outcome !== undefined) {
            counts[outcome.status]++;
        }
    }
    if (opts.dryRun) {
        log(`would run ${counts['would-run']} (${counts.clean} up to date)`);
    } else {
        const parts = [`${counts.clean} up to date`];
        if (counts.ran > 0) {
            parts.push(`${counts.ran} ran`);
        }
        if (counts.failed > 0) {
            parts.push(`${counts.failed} FAILED`);
        }
        if (counts.blocked > 0) {
            parts.push(`${counts.blocked} blocked`);
        }
        log(parts.join(', ') + '.');
        if (counts.failed > 0) {
            logError('Failed rules:');
            for (const decl of decls) {
                if (result.outcomes.get(decl)?.status === 'failed') {
                    logError(`  ${label(decl)}`);
                }
            }
        }
    }

    if (opts.gc && !opts.dryRun && !interrupted
        && result.ok && result.keys.size === decls.length) {
        const removedRules = store.deleteKeysNotIn(new Set(result.keys.values()));
        const removedObjects = casSweep(opts.casDir, store.liveObjects());
        store.pruneFileCache(sources);
        if (removedRules > 0 || removedObjects > 0) {
            log(`gc: removed ${removedRules} rules, ${removedObjects} objects`);
        }
    }

    return {...result, interrupted};
}
