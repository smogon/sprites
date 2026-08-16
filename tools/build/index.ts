
import fs from 'fs';
import os from 'os';
import pathlib from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import {program} from 'commander';
import debugfn from 'debug';

import {getRules, type RuleDecl, setConfig} from './api.ts';
import {loadConfig} from './config.ts';
import {acquireLock, BuildDb, type RecordedOutput} from './db.ts';
import {killAllProcessGroups, runShell, workerPool} from './exec.ts';
import {BuildError, checkGraph} from './graph.ts';
import {reconcileHashes} from './hash.ts';
import {computePlan, type OutputStat, ruleInputSig} from './plan.ts';

const debug = debugfn('build');

program
    .option('-j, --jobs <n>', 'number of parallel jobs', String(os.availableParallelism()))
    .option('-n, --dry-run', 'print the plan without changing anything')
    .option('--adopt', 'record existing outputs as up to date instead of running (migration)')
    .option('--fail-fast', 'stop scheduling new rules after the first failure')
    .option('--config <file>', 'config file', 'build.config')
    .option('-v, --verbose', 'print more detail');
program.parse(process.argv);
const opts = program.opts();

const root = pathlib.resolve(fileURLToPath(import.meta.url), '../../..');
process.chdir(root);

function statPath(path : string) : OutputStat | null {
    try {
        const st = fs.statSync(path, {bigint: true});
        return st.isFile() ? {size: st.size, mtimeNs: st.mtimeNs} : null;
    } catch {
        return null;
    }
}

function label(decl : RuleDecl) : string {
    return decl.display ?? decl.command.split(' && ')[0]!;
}

function indent(text : string) : string {
    return text.replace(/\n$/, '').split('\n').map(l => '    ' + l).join('\n');
}

async function main() : Promise<number> {
    const jobs = Number(opts.jobs);
    if (!Number.isInteger(jobs) || jobs < 1) {
        throw new BuildError(`Invalid --jobs value: ${opts.jobs}`);
    }
    const dryRun = Boolean(opts.dryRun);
    const releaseLock = dryRun ? null : acquireLock('.build/lock.sqlite');
    // A dry run must not create state; without an existing db it reads from
    // an empty in-memory one.
    const dbPath = dryRun && !fs.existsSync('.build/db.sqlite') ? ':memory:' : '.build/db.sqlite';
    const db = new BuildDb(dbPath);
    try {
        // Phase 1: evaluate the rule set
        setConfig(loadConfig(opts.config));
        await import(pathToFileURL(pathlib.join(root, 'Buildfile.ts')).href);
        const rules = getRules();
        const {order, generated} = checkGraph(rules);
        for (const rule of rules) {
            for (const path of [...rule.inputs, ...rule.deps]) {
                if (generated.has(path)) {
                    // The planner assumes all inputs are hashable before
                    // execution; support this when a rule needs it.
                    throw new BuildError(`Rules consuming generated files are not yet supported: ${path}`);
                }
            }
        }
        debug('%d rules', rules.length);

        // Phase 2: hash source files (stat-cached)
        const sources = new Set<string>();
        for (const rule of rules) {
            for (const path of [...rule.inputs, ...rule.deps]) {
                sources.add(path);
            }
        }
        const {hashes, updated, missing} = reconcileHashes(sources, db.loadFileCache());
        if (missing.length > 0) {
            throw new BuildError(`Missing input files:\n  ${missing.slice(0, 20).join('\n  ')}`
                + (missing.length > 20 ? `\n  ... and ${missing.length - 20} more` : ''));
        }
        if (!dryRun && updated.size > 0) {
            db.saveFileCache(updated);
        }
        debug('hashed %d files (%d cached)', sources.size, sources.size - updated.size);

        // Phase 3: plan
        const statMemo = new Map<string, OutputStat | null>();
        const statOutput = (path : string) => {
            let st = statMemo.get(path);
            if (st === undefined) {
                statMemo.set(path, st = statPath(path));
            }
            return st;
        };
        const stored = db.loadStoredRules();
        const plan = computePlan({
            current: rules,
            stored,
            hashes,
            statOutput,
            adopt: Boolean(opts.adopt),
        });

        // Keep stored template/display in sync for key-matched rules; they are
        // outside the key, so e.g. a template format change in this tool would
        // otherwise silently disable rename detection for old records.
        if (!dryRun) {
            const storedByKey = new Map(stored.map(s => [s.key, s]));
            const staleMeta = [];
            for (const decl of rules) {
                const s = storedByKey.get(decl.key);
                if (s !== undefined && (s.template !== decl.template || s.display !== decl.display)) {
                    staleMeta.push({id: s.id, template: decl.template, display: decl.display});
                }
            }
            db.refreshRuleMeta(staleMeta);
        }

        const staleOutputs = [];
        const currentOutputs = new Set(rules.flatMap(r => r.outputs));
        for (const s of plan.stale) {
            for (const o of s.outputs) {
                if (!currentOutputs.has(o.path)) {
                    staleOutputs.push(o.path);
                }
            }
        }

        if (plan.run.length + plan.renames.length + plan.adopt.length + plan.stale.length === 0) {
            console.log(`${plan.clean.length} rules up to date.`);
            return 0;
        }
        if (opts.verbose || dryRun) {
            for (const {decl, reason} of plan.run) {
                console.log(`run (${reason}): ${label(decl)}`);
            }
            for (const {decl, from} of plan.renames) {
                console.log(`rename: ${from.outputs.map(o => o.path).join(' ')} -> ${decl.outputs.join(' ')}`);
            }
            for (const decl of plan.adopt) {
                console.log(`adopt: ${label(decl)}`);
            }
            for (const path of staleOutputs) {
                console.log(`delete: ${path}`);
            }
        }
        if (dryRun) {
            console.log(`would run ${plan.run.length}, rename ${plan.renames.length}, `
                + `adopt ${plan.adopt.length}, delete ${staleOutputs.length} outputs `
                + `(${plan.clean.length} up to date)`);
            return 0;
        }

        // Phase 4: renames (before stale deletion: sources must still exist)
        let renamed = 0;
        for (const {decl, from} of plan.renames) {
            // An earlier copy in this loop may have overwritten this rename's
            // source (rename destinations can collide with rename sources);
            // re-verify every source against its recorded stat before copying
            // so only verified bytes ever propagate.
            const intact = from.outputs.every(o => {
                const st = statPath(o.path);
                return o.size !== null && st !== null
                    && st.size === o.size && st.mtimeNs === o.mtimeNs;
            });
            if (!intact) {
                plan.run.push({decl, reason: 'new'});
                continue;
            }
            const recorded : RecordedOutput[] = [];
            for (let i = 0; i < decl.outputs.length; i++) {
                const src = from.outputs[i]!.path;
                const dst = decl.outputs[i]!;
                if (src !== dst) {
                    fs.mkdirSync(pathlib.dirname(dst), {recursive: true});
                    fs.copyFileSync(src, dst);
                }
                const st = statPath(dst);
                if (st === null) {
                    throw new BuildError(`Rename copy failed: ${src} -> ${dst}`);
                }
                recorded.push({path: dst, size: st.size, mtimeNs: st.mtimeNs});
            }
            db.recordRuleResult(decl, hashes, ruleInputSig(decl, hashes), recorded);
            renamed++;
        }

        // Phase 5: delete outputs of removed rules, prune empty dirs
        const staleDirs = new Set<string>();
        for (const s of plan.stale) {
            for (const o of s.outputs) {
                if (!currentOutputs.has(o.path)) {
                    try {
                        fs.unlinkSync(o.path);
                    } catch (err) {
                        if ((err as {code? : string}).code !== 'ENOENT') {
                            throw err;
                        }
                    }
                    staleDirs.add(pathlib.dirname(o.path));
                }
            }
            db.deleteRule(s.id);
        }
        for (let dir of staleDirs) {
            while (dir.startsWith('build/')) {
                try {
                    fs.rmdirSync(dir);
                } catch {
                    break;
                }
                dir = pathlib.dirname(dir);
            }
        }
        db.pruneFileCache(sources);

        // Phase 6: adoption (migration): trust existing outputs
        for (const decl of plan.adopt) {
            const recorded = decl.outputs.map(path => {
                const st = statPath(path)!;
                return {path, size: st.size, mtimeNs: st.mtimeNs};
            });
            db.recordRuleResult(decl, hashes, ruleInputSig(decl, hashes), recorded);
        }

        // Phase 7: execute
        // The worker pool does not serialize producers before consumers; that
        // is safe because rules consuming generated files are rejected above.
        // `order` is used for a stable, declaration-ordered schedule.
        const orderIndex = new Map(order.map((r, i) => [r, i]));
        const runList = [...plan.run].sort((a, b) => orderIndex.get(a.decl)! - orderIndex.get(b.decl)!);
        const ac = new AbortController();
        let interrupted = false;
        const onSignal = () => {
            if (interrupted) {
                killAllProcessGroups();
                process.exit(130);
            }
            interrupted = true;
            console.error('\nInterrupted; waiting for running rules to stop...');
            ac.abort();
        };
        process.on('SIGINT', onSignal);
        process.on('SIGTERM', onSignal);

        const failures : RuleDecl[] = [];
        let done = 0;
        await workerPool(runList, jobs, async ({decl}) => {
            if (ac.signal.aborted) {
                return;
            }
            try {
                for (const out of decl.outputs) {
                    fs.mkdirSync(pathlib.dirname(out), {recursive: true});
                }
                const result = await runShell(decl.command, {cwd: root, signal: ac.signal});
                if (ac.signal.aborted && result.code !== 0) {
                    return;  // killed by the abort, not a real failure; stays dirty
                }
                let recorded : RecordedOutput[] | null = null;
                const missingOutputs = [];
                if (result.code === 0) {
                    recorded = [];
                    for (const path of decl.outputs) {
                        const st = statPath(path);
                        if (st === null) {
                            missingOutputs.push(path);
                            recorded = null;
                            break;
                        }
                        recorded.push({path, size: st.size, mtimeNs: st.mtimeNs});
                    }
                }
                db.recordRuleResult(decl, hashes, ruleInputSig(decl, hashes), recorded);
                done++;
                if (recorded !== null) {
                    console.log(`[${done}/${runList.length}] ${label(decl)}`);
                    if (result.output !== '') {
                        console.log(indent(result.output));
                    }
                } else {
                    failures.push(decl);
                    console.error(`[${done}/${runList.length}] FAILED: ${label(decl)}`);
                    console.error(`    command: ${decl.command}`);
                    if (result.output !== '') {
                        console.error(indent(result.output));
                    }
                    if (missingOutputs.length > 0) {
                        console.error(`    command succeeded but did not produce: ${missingOutputs.join(' ')}`);
                    }
                    if (opts.failFast) {
                        ac.abort();
                    }
                }
            } catch (err) {
                // Unexpected (infrastructure) error: count the rule failed and
                // stop scheduling; something systemic is wrong.
                failures.push(decl);
                console.error(`FAILED (internal error): ${label(decl)}`);
                console.error(indent(err instanceof Error ? err.stack ?? err.message : String(err)));
                ac.abort();
            }
        });
        process.off('SIGINT', onSignal);
        process.off('SIGTERM', onSignal);

        // Phase 8: summary
        const parts = [`${plan.clean.length} up to date`];
        if (runList.length > 0) {
            parts.push(`${done - failures.length} ran`);
        }
        if (renamed > 0) {
            parts.push(`${renamed} renamed`);
        }
        if (plan.adopt.length > 0) {
            parts.push(`${plan.adopt.length} adopted`);
        }
        if (plan.stale.length > 0) {
            parts.push(`${plan.stale.length} removed`);
        }
        if (failures.length > 0) {
            parts.push(`${failures.length} FAILED`);
        }
        console.log(parts.join(', ') + '.');
        if (failures.length > 0) {
            console.error('Failed rules:');
            for (const decl of failures) {
                console.error(`  ${label(decl)}`);
            }
        }
        return interrupted ? 130 : failures.length > 0 ? 1 : 0;
    } finally {
        db.close();
        releaseLock?.();
    }
}

try {
    process.exitCode = await main();
} catch (err) {
    if (err instanceof BuildError) {
        console.error(err.message);
        process.exitCode = 1;
    } else {
        throw err;
    }
}
