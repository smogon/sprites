
import {spawn, type ChildProcess} from 'child_process';
import fs from 'fs';
import os from 'os';
import nodePath from 'path';
import {fileURLToPath, pathToFileURL} from 'url';

import {program} from 'commander';

import {type RuleDecl, getDecls} from '../build/artifact.ts';
import {casPath} from '../build/cas.ts';
import {loadConfig} from '../build/config.ts';
import {build} from '../build/driver.ts';
import {BuildError} from '../build/errors.ts';
import {killAllProcessGroups} from '../build/exec.ts';
import {setConfig} from '../build/helpers.ts';
import {Store, acquireLock, dbVersion} from '../build/store.ts';
import {type DeploySpec, makeCtx} from './api.ts';
import {loadDeployConfig, matchSubsets} from './config.ts';
import {ActionQueue} from './queue.ts';

const root = nodePath.resolve(fileURLToPath(import.meta.url), '../../..');
const invocationCwd = process.cwd();
process.chdir(root);

const DB_PATH = '.build/db.sqlite';
const LOCK_PATH = '.build/lock.sqlite';
const CAS_DIR = '.build/cas';
const TMP_DIR = '.build/tmp';

interface CommonOpts {
    jobs : string;
    dryRun? : boolean;
    failFast? : boolean;
    config : string;
    verbose? : boolean;
}

function common(cmd : ReturnType<typeof program.command>) : ReturnType<typeof program.command> {
    return cmd
        .option('-j, --jobs <n>', 'number of parallel jobs', String(os.availableParallelism()))
        .option('-n, --dry-run', 'print what would run without changing anything')
        .option('--fail-fast', 'stop scheduling new rules after the first failure')
        .option('--config <file>', 'config file', 'build.config')
        .option('-v, --verbose', 'print more detail');
}

function discoverDeployFiles() : string[] {
    const files = fs.readdirSync('.').filter(f => f.endsWith('.build.ts')).sort();
    if (files.length === 0) {
        throw new BuildError('No *.build.ts files at the repo root');
    }
    return files;
}

// Importing a deploy module declares its rules; the default export carries
// the finish function.
async function importDeploys(files : string[]) : Promise<Map<string, DeploySpec | null>> {
    const specs = new Map<string, DeploySpec | null>();
    for (const file of files) {
        const mod : {default? : unknown} = await import(pathToFileURL(nodePath.resolve(file)).href);
        const spec = mod.default;
        if (typeof spec === 'object' && spec !== null
            && typeof (spec as DeploySpec).finish === 'function') {
            specs.set(file, spec as DeploySpec);
        } else {
            specs.set(file, null);
        }
    }
    return specs;
}

// Build `decls` and, on success, run `then` while still holding the lock (a
// concurrent GC must not sweep CAS objects out from under a finish). Returns
// the process exit code.
async function buildThen(decls : readonly RuleDecl[], opts : CommonOpts, gc : boolean,
                         then? : () => Promise<number>) : Promise<number> {
    const jobs = Number(opts.jobs);
    if (!Number.isInteger(jobs) || jobs < 1) {
        throw new BuildError(`Invalid --jobs value: ${opts.jobs}`);
    }
    const dryRun = Boolean(opts.dryRun);
    const release = dryRun ? null : acquireLock(LOCK_PATH);
    try {
        // A dry run must not create state (opening a db migrates it);
        // without a current-version db it reads from an empty in-memory one.
        const dbPath = dryRun && dbVersion(DB_PATH) !== 2 ? ':memory:' : DB_PATH;
        const store = new Store(dbPath);
        if (!dryRun) {
            fs.rmSync(TMP_DIR, {recursive: true, force: true});
        }

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
        let ok : boolean;
        try {
            const result = await build(decls, {
                root,
                store,
                casDir: CAS_DIR,
                tmpDir: TMP_DIR,
                jobs,
                dryRun,
                failFast: Boolean(opts.failFast),
                verbose: Boolean(opts.verbose),
                gc,
                signal: ac.signal,
            });
            ok = result.ok;
        } finally {
            process.off('SIGINT', onSignal);
            process.off('SIGTERM', onSignal);
            store.close();
        }
        if (interrupted) {
            return 130;
        }
        if (dryRun) {
            return 0;
        }
        if (!ok) {
            return 1;
        }
        return then === undefined ? 0 : await then();
    } finally {
        release?.();
    }
}

function finishOf(specs : Map<string, DeploySpec | null>, file : string) : DeploySpec {
    const spec = specs.get(file);
    if (spec === null || spec === undefined) {
        throw new BuildError(`${file} does not default-export a deploy (use defineDeploy)`);
    }
    return spec;
}

async function runFinish(spec : DeploySpec, verbose : boolean) : Promise<ActionQueue | null> {
    const aq = new ActionQueue();
    await spec.finish(makeCtx(CAS_DIR, aq));
    if (!aq.valid) {
        aq.print(verbose ? 'all' : 'errors');
        return null;
    }
    return aq;
}

function waitExit(child : ChildProcess) : Promise<number | null> {
    return new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', code => resolve(code));
    });
}

common(program.command('build [files...]'))
    .description('build the rules of the given deploys (default: all *.build.ts)')
    .action(async (files : string[], opts : CommonOpts) => {
        setConfig(loadConfig(opts.config));
        // GC needs the full rule universe: only an unfiltered union build
        // can know which keys are no longer declared anywhere.
        const gc = files.length === 0 && !Boolean(opts.dryRun);
        await importDeploys(files.length > 0 ? files : discoverDeployFiles());
        process.exitCode = await buildThen(getDecls(), opts, gc);
    });

common(program.command('deploy [names...]'))
    .description('build, finish, and pipe each subset tar to its command from deploy.json5')
    .action(async (names : string[], opts : CommonOpts) => {
        const config = loadDeployConfig('deploy.json5');
        const targets = names.length > 0 ? names : [...config.keys()];
        for (const name of targets) {
            if (!config.has(name)) {
                throw new BuildError(`deploy.json5: no deploy named ${name}`);
            }
        }
        setConfig(loadConfig(opts.config));
        const files = [...new Set(targets.map(n => config.get(n)!.buildFile))];
        const specs = await importDeploys(files);
        process.exitCode = await buildThen(getDecls(), opts, false, async () => {
            for (const name of targets) {
                const target = config.get(name)!;
                const aq = await runFinish(finishOf(specs, target.buildFile), Boolean(opts.verbose));
                if (aq === null) {
                    return 1;
                }
                const dsts = aq.log.filter(e => e.type === 'Op').map(e => e.dst);
                const subsets = matchSubsets(dsts, target.deploy);
                for (const [i, entry] of target.deploy.entries()) {
                    const matched = subsets[i]!;
                    console.log(`${name}: ${matched.size} files | ${entry.cmd}`);
                    const upload = spawn(entry.cmd, {shell: true, stdio: ['pipe', 'inherit', 'inherit']});
                    // If the command dies early we report its exit code; don't
                    // also crash on the resulting EPIPE.
                    upload.stdin!.on('error', () => {});
                    aq.pack(dst => matched.has(dst)).pipe(upload.stdin!);
                    if (await waitExit(upload) !== 0) {
                        return 1;
                    }
                }
            }
            return 0;
        });
    });

common(program.command('run <file>'))
    .description('build, finish, and materialize to a directory (or tar file)')
    .requiredOption('-o, --output <dir>', 'output directory (a file with --tar)')
    .option('--link', 'hardlink instead of copying')
    .option('--tar', 'write a tar file')
    .action(async (file : string, opts : CommonOpts & {output : string, link? : boolean, tar? : boolean}) => {
        setConfig(loadConfig(opts.config));
        const specs = await importDeploys([file]);
        process.exitCode = await buildThen(getDecls(), opts, false, async () => {
            const aq = await runFinish(finishOf(specs, file), Boolean(opts.verbose));
            if (aq === null) {
                return 1;
            }
            await aq.run(opts.output, opts.tar ? 'tar' : opts.link ? 'link' : 'copy');
            return 0;
        });
    });

function slugOf(decl : RuleDecl) : string {
    const template = decl.displayTemplate ?? decl.cmds[0]!;
    const slug = template.replace(/%[a-zA-Z0-9]+/g, ' ')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return slug === '' ? 'rule' : slug;
}

common(program.command('inspect <paths...>'))
    .description('build every rule touching the given source paths and copy the outputs out')
    .requiredOption('-o, --output <dir>', 'output directory')
    .action(async (paths : string[], opts : CommonOpts & {output : string}) => {
        setConfig(loadConfig(opts.config));
        await importDeploys(discoverDeployFiles());
        // Accept absolute paths and paths relative to where the user ran the
        // command; rules declare repo-root-relative paths.
        const targets = paths.map(p => {
            const target = nodePath.relative(root, nodePath.resolve(invocationCwd, p));
            if (target.startsWith('..')) {
                throw new BuildError(`Not under the repo root: ${p}`);
            }
            return target;
        });

        const closure = new Set<RuleDecl>();
        for (const decl of getDecls()) {
            const hit = [...decl.inputs, ...decl.deps].some(i => typeof i === 'string'
                && targets.some(t => i === t || i.startsWith(t + '/')));
            if (hit) {
                closure.add(decl);
            }
        }
        if (closure.size === 0) {
            throw new BuildError(`No rules consume: ${targets.join(' ')}`);
        }
        // Transitive consumers: show everything these files end up in. The
        // executor pulls in any producers the closure needs on its own.
        for (let grew = true; grew;) {
            grew = false;
            for (const decl of getDecls()) {
                if (closure.has(decl)) {
                    continue;
                }
                if ([...decl.inputs, ...decl.deps].some(i => typeof i !== 'string' && closure.has(i.decl))) {
                    closure.add(decl);
                    grew = true;
                }
            }
        }

        const decls = getDecls().filter(d => closure.has(d));
        console.log(`inspect: ${decls.length} rules`);
        process.exitCode = await buildThen(decls, opts, false, async () => {
            for (const decl of decls) {
                const dir = nodePath.join(opts.output, slugOf(decl));
                fs.mkdirSync(dir, {recursive: true});
                for (const artifact of decl.outputs) {
                    let dst = nodePath.join(dir, artifact.filename);
                    for (let n = 2; fs.existsSync(dst); n++) {
                        dst = nodePath.join(dir, `${artifact.name}-${n}.${artifact.ext}`);
                    }
                    fs.copyFileSync(casPath(CAS_DIR, artifact.hash, artifact.ext), dst);
                    fs.chmodSync(dst, 0o644);
                    console.log(`${nodePath.relative(opts.output, dst)}`);
                }
            }
            return 0;
        });
    });

try {
    await program.parseAsync(process.argv);
    if (process.argv.slice(2).length === 0) {
        program.outputHelp();
    }
} catch (err) {
    if (err instanceof BuildError) {
        console.error(err.message);
        process.exitCode = 1;
    } else {
        throw err;
    }
}
