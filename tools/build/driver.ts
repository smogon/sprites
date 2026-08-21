
import {type RuleDecl} from './artifact.ts';
import {casSweep} from './cas.ts';
import {BuildError} from './errors.ts';
import * as executor from './executor.ts';
import {reconcileHashes} from './hash.ts';
import {type Store} from './store.ts';

export type BuildOpts = {
    root: string,
    store: Store,
    casDir: string;                 // relative to root; where outputs land
    tmpDir: string,
    jobs: number,
    dryRun: boolean,
    failFast: boolean,
    verbose: boolean,
    // GC after a fully successful build: drop rules whose key is no longer
    // declared, sweep unreferenced CAS objects, prune the file cache. Only
    // safe when `decls` is the full rule universe (a partial build would GC
    // the other deploys' state), so the CLI sets it for union builds only.
    gc: boolean,
    signal: AbortSignal,
    log?: (line: string) => void,
    logError?: (line: string) => void,
};

export type DriveResult = executor.BuildResult & {
    interrupted: boolean,
};

export async function build(decls: readonly RuleDecl[], opts: BuildOpts): Promise<DriveResult> {
    let log = opts.log ?? console.log;
    let logError = opts.logError ?? console.error;
    let {store} = opts;

    let sources = new Set(decls.flatMap(d => [...d.inputs, ...d.deps]));
    let {hashes, updated, missing} = await reconcileHashes(sources, store.loadFileCache());
    if (missing.length > 0) {
        throw new BuildError(`Missing input files:\n  ${missing.slice(0, 20).join('\n  ')}`
            + (missing.length > 20 ? `\n  ... and ${missing.length - 20} more` : ''));
    }
    if (!opts.dryRun && updated.size > 0) {
        store.saveFileCache(updated);
    }

    let exe = new executor.Executor({
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
    let result = await exe.build(decls);
    let interrupted = opts.signal.aborted;

    let counts = {clean: 0, ran: 0, 'would-run': 0, failed: 0};
    for (let decl of decls) {
        let outcome = result.outcomes.get(decl);
        if (outcome !== undefined) {
            counts[outcome.status]++;
        }
    }
    if (opts.dryRun) {
        log(`would run ${counts['would-run']} (${counts.clean} up to date)`);
    } else {
        let parts = [`${counts.clean} up to date`];
        if (counts.ran > 0) {
            parts.push(`${counts.ran} ran`);
        }
        if (counts.failed > 0) {
            parts.push(`${counts.failed} FAILED`);
        }
        log(parts.join(', ') + '.');
        if (counts.failed > 0) {
            logError('Failed rules:');
            for (let decl of decls) {
                if (result.outcomes.get(decl)?.status === 'failed') {
                    logError(`  ${executor.label(decl)}`);
                }
            }
        }
    }

    if (opts.gc && !opts.dryRun && !interrupted
        && result.ok && result.keys.size === decls.length) {
        let removedRules = store.deleteKeysNotIn(new Set(result.keys.values()));
        let removedObjects = await casSweep(opts.casDir, store.liveObjects());
        store.pruneFileCache(sources);
        if (removedRules > 0 || removedObjects > 0) {
            log(`gc: removed ${removedRules} rules, ${removedObjects} objects`);
        }
    }

    return {...result, interrupted};
}
