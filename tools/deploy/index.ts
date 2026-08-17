
import {spawn, type ChildProcess} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as nodePath from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';

import * as artifact from '../build/artifact.ts';
import {casPath} from '../build/cas.ts';
import {loadConfig} from '../build/config.ts';
import {build} from '../build/driver.ts';
import {BuildError} from '../build/errors.ts';
import {killAllProcessGroups} from '../build/exec.ts';
import {setConfig} from '../build/helpers.ts';
import * as db from '../build/store.ts';
import * as api from './api.ts';
import {loadDeployConfig, matchSubsets} from './config.ts';
import {ActionQueue} from './queue.ts';

let root = nodePath.resolve(fileURLToPath(import.meta.url), '../../..');
let invocationCwd = process.cwd();
process.chdir(root);

let DB_PATH = '.build/db.sqlite';
let LOCK_PATH = '.build/lock.sqlite';
let CAS_DIR = '.build/cas';
let TMP_DIR = '.build/tmp';

type CommonOpts = {
    jobs: string,
    dryRun?: boolean,
    failFast?: boolean,
    config: string,
    verbose?: boolean,
};

type VerbOpts = CommonOpts & {
    output?: string,
    link?: boolean,
    tar?: boolean,
};

let USAGE = `usage: node tools/deploy/index.ts <command> [options]

commands:
  build [files...]            build the rules of the given deploys (default: all *.build.ts)
  deploy [names...]           build, finish, and pipe each subset tar (or %d dir) to its
                              command from deploy.json5 (no names: list the deploys;
                              -o <dir>: materialize each subset there instead of
                              running its command)
  run <file> -o <dir>         build, finish, and materialize to a directory (or tar file)
  inspect <paths...> -o <dir> build every rule touching the given source paths and copy
                              the outputs out

options:
  -j, --jobs <n>       number of parallel jobs (default: all cores)
  -n, --dry-run        print what would run without changing anything
      --fail-fast      stop scheduling new rules after the first failure
      --config <file>  config file (default: build.config)
  -o, --output <dir>   run/inspect/deploy: output directory (a file with --tar)
      --link           run: hardlink instead of copying
      --tar            run: write a tar file
  -v, --verbose        print more detail
  -h, --help           show this help`;

let COMMON_OPTIONS = {
    jobs: {type: 'string', short: 'j', default: String(os.availableParallelism())},
    'dry-run': {type: 'boolean', short: 'n'},
    'fail-fast': {type: 'boolean'},
    config: {type: 'string', default: 'build.config'},
    verbose: {type: 'boolean', short: 'v'},
    help: {type: 'boolean', short: 'h'},
} as const;

let VERB_OPTIONS = {
    build: {},
    deploy: {
        output: {type: 'string', short: 'o'},
    },
    run: {
        output: {type: 'string', short: 'o'},
        link: {type: 'boolean'},
        tar: {type: 'boolean'},
    },
    inspect: {
        output: {type: 'string', short: 'o'},
    },
} as const;

function requireOutput(opts: VerbOpts): string {
    if (opts.output === undefined) {
        throw new BuildError('missing -o/--output');
    }
    return opts.output;
}

function discoverDeployFiles(): string[] {
    let files = fs.readdirSync('.').filter(f => f.endsWith('.build.ts')).sort();
    if (files.length === 0) {
        throw new BuildError('No *.build.ts files at the repo root');
    }
    return files;
}

// Importing a deploy module declares its rules and registers its deploy
// blocks; the registry delta over each sequential import is that file's
// blocks.
async function importDeploys(files: string[]): Promise<Map<string, readonly api.DeployFn[]>> {
    let specs = new Map<string, readonly api.DeployFn[]>();
    for (let file of files) {
        let before = api.getDeploys().length;
        await import(pathToFileURL(nodePath.resolve(file)).href);
        specs.set(file, api.getDeploys().slice(before));
    }
    return specs;
}

// Build `decls` and, on success, run `then` while still holding the lock (a
// concurrent GC must not sweep CAS objects out from under a finish). Returns
// the process exit code.
async function buildThen(decls: readonly artifact.RuleDecl[], opts: CommonOpts, gc: boolean,
                         then?: () => Promise<number>): Promise<number> {
    let jobs = Number(opts.jobs);
    if (!Number.isInteger(jobs) || jobs < 1) {
        throw new BuildError(`Invalid --jobs value: ${opts.jobs}`);
    }
    let dryRun = Boolean(opts.dryRun);
    let release = dryRun ? null : db.acquireLock(LOCK_PATH);
    try {
        // A dry run must not create state (opening a db migrates it);
        // without a current-version db it reads from an empty in-memory one.
        let dbPath = dryRun && db.dbVersion(DB_PATH) !== 2 ? ':memory:' : DB_PATH;
        let store = new db.Store(dbPath);
        if (!dryRun) {
            fs.rmSync(TMP_DIR, {recursive: true, force: true});
        }

        let ac = new AbortController();
        let interrupted = false;
        let onSignal = () => {
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
        let ok: boolean;
        try {
            let result = await build(decls, {
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

function finishOf(specs: Map<string, readonly api.DeployFn[]>, file: string): readonly api.DeployFn[] {
    let fns = specs.get(file);
    if (fns === undefined || fns.length === 0) {
        throw new BuildError(`${file} registers no deploy blocks (use deploy())`);
    }
    return fns;
}

async function runFinish(fns: readonly api.DeployFn[], verbose: boolean): Promise<ActionQueue | null> {
    let aq = new ActionQueue();
    let ctx = api.makeCtx(CAS_DIR, aq);
    for (let fn of fns) {
        await fn(ctx);
    }
    if (!aq.valid) {
        aq.print(verbose ? 'all' : 'errors');
        return null;
    }
    return aq;
}

function waitExit(child: ChildProcess): Promise<number | null> {
    return new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', code => resolve(code));
    });
}

async function cmdBuild(files: string[], opts: CommonOpts): Promise<void> {
    setConfig(loadConfig(opts.config));
    // GC needs the full rule universe: only an unfiltered union build
    // can know which keys are no longer declared anywhere.
    let gc = files.length === 0 && !Boolean(opts.dryRun);
    await importDeploys(files.length > 0 ? files : discoverDeployFiles());
    process.exitCode = await buildThen(artifact.getDecls(), opts, gc);
}

async function cmdDeploy(names: string[], opts: VerbOpts): Promise<void> {
    let config = loadDeployConfig('deploy.json5');
    if (names.length === 0) {
        for (let [name, target] of config) {
            console.log(`${name} (${target.buildFile})`);
            for (let entry of target.deploy) {
                console.log(`    ${entry.subset.join(' ')} | ${entry.cmd}`);
            }
        }
        return;
    }
    for (let name of names) {
        if (!config.has(name)) {
            throw new BuildError(`deploy.json5: no deploy named ${name}`);
        }
    }
    setConfig(loadConfig(opts.config));
    let files = [...new Set(names.map(n => config.get(n)!.buildFile))];
    let specs = await importDeploys(files);
    process.exitCode = await buildThen(artifact.getDecls(), opts, false, async () => {
        for (let name of names) {
            let target = config.get(name)!;
            let aq = await runFinish(finishOf(specs, target.buildFile), Boolean(opts.verbose));
            if (aq === null) {
                return 1;
            }
            let dsts = aq.log.filter(e => e.type === 'Op').map(e => e.dst);
            let subsets = matchSubsets(dsts, target.deploy);
            for (let [i, entry] of target.deploy.entries()) {
                let matched = subsets[i]!;
                console.log(`${name}: ${matched.size} files | ${entry.cmd}`);
                // Debug mode: materialize what each entry would ship (tar
                // entries included) instead of running its command.
                if (opts.output !== undefined) {
                    let dir = nodePath.join(opts.output, name, String(i));
                    await aq.run(dir, 'copy', dst => matched.has(dst));
                    console.log(`    -> ${dir}`);
                    continue;
                }
                if (entry.dir) {
                    fs.mkdirSync(TMP_DIR, {recursive: true});
                    let tmp = fs.mkdtempSync(nodePath.join(TMP_DIR, 'deploy-'));
                    try {
                        await aq.run(tmp, 'copy', dst => matched.has(dst));
                        let cmd = spawn(entry.cmd.replaceAll('%d', tmp),
                            {shell: true, stdio: ['ignore', 'inherit', 'inherit']});
                        if (await waitExit(cmd) !== 0) {
                            return 1;
                        }
                    } finally {
                        fs.rmSync(tmp, {recursive: true, force: true});
                    }
                    continue;
                }
                let upload = spawn(entry.cmd, {shell: true, stdio: ['pipe', 'inherit', 'inherit']});
                // If the command dies early we report its exit code; don't
                // also crash on the resulting EPIPE, which reaches both
                // stdin and (via streamx's destroy propagation) the pack.
                upload.stdin!.on('error', () => {});
                let pack = aq.pack(dst => matched.has(dst));
                pack.on('error', () => {});
                pack.pipe(upload.stdin!);
                if (await waitExit(upload) !== 0) {
                    return 1;
                }
            }
        }
        return 0;
    });
}

async function cmdRun(file: string, opts: VerbOpts): Promise<void> {
    let output = requireOutput(opts);
    setConfig(loadConfig(opts.config));
    let specs = await importDeploys([file]);
    process.exitCode = await buildThen(artifact.getDecls(), opts, false, async () => {
        let aq = await runFinish(finishOf(specs, file), Boolean(opts.verbose));
        if (aq === null) {
            return 1;
        }
        await aq.run(output, opts.tar ? 'tar' : opts.link ? 'link' : 'copy');
        return 0;
    });
}

function slugOf(decl: artifact.RuleDecl): string {
    let template = decl.displayTemplate ?? decl.cmds[0]!;
    let slug = template.replace(/%[a-zA-Z0-9]+/g, ' ')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return slug === '' ? 'rule' : slug;
}

async function cmdInspect(paths: string[], opts: VerbOpts): Promise<void> {
    let output = requireOutput(opts);
    setConfig(loadConfig(opts.config));
    await importDeploys(discoverDeployFiles());
    // Accept absolute paths and paths relative to where the user ran the
    // command; rules declare repo-root-relative paths.
    let targets = paths.map(p => {
        let target = nodePath.relative(root, nodePath.resolve(invocationCwd, p));
        if (target.startsWith('..')) {
            throw new BuildError(`Not under the repo root: ${p}`);
        }
        return target;
    });

    let closure = new Set<artifact.RuleDecl>();
    for (let decl of artifact.getDecls()) {
        let hit = [...decl.inputs, ...decl.deps].some(i => typeof i === 'string'
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
        for (let decl of artifact.getDecls()) {
            if (closure.has(decl)) {
                continue;
            }
            if ([...decl.inputs, ...decl.deps].some(i => typeof i !== 'string' && closure.has(i.decl))) {
                closure.add(decl);
                grew = true;
            }
        }
    }

    let decls = artifact.getDecls().filter(d => closure.has(d));
    console.log(`inspect: ${decls.length} rules`);
    process.exitCode = await buildThen(decls, opts, false, async () => {
        for (let decl of decls) {
            let dir = nodePath.join(output, slugOf(decl));
            fs.mkdirSync(dir, {recursive: true});
            for (let artifact of decl.outputs) {
                let dst = nodePath.join(dir, artifact.filename);
                for (let n = 2; fs.existsSync(dst); n++) {
                    dst = nodePath.join(dir, `${artifact.name}-${n}.${artifact.ext}`);
                }
                fs.copyFileSync(casPath(CAS_DIR, artifact.hash, artifact.ext), dst);
                fs.chmodSync(dst, 0o644);
                console.log(`${nodePath.relative(output, dst)}`);
            }
        }
        return 0;
    });
}

async function main(argv: string[]): Promise<void> {
    let [verb, ...rest] = argv;
    if (verb === undefined || verb === '-h' || verb === '--help') {
        console.log(USAGE);
        return;
    }
    if (!(verb in VERB_OPTIONS)) {
        throw new BuildError(`Unknown command: ${verb} (-h for usage)`);
    }
    let parsed;
    try {
        parsed = parseArgs({
            args: rest,
            options: {...COMMON_OPTIONS, ...VERB_OPTIONS[verb as keyof typeof VERB_OPTIONS]},
            allowPositionals: true,
        });
    } catch (err) {
        throw new BuildError(`${(err as Error).message.split('\n')[0]} (-h for usage)`);
    }
    let v = parsed.values as {[k: string]: string | boolean | undefined};
    let positionals = parsed.positionals;
    if (v.help) {
        console.log(USAGE);
        return;
    }
    let opts: VerbOpts = {
        jobs: v.jobs as string,
        dryRun: Boolean(v['dry-run']),
        failFast: Boolean(v['fail-fast']),
        config: v.config as string,
        verbose: Boolean(v.verbose),
        output: v.output as string | undefined,
        link: Boolean(v.link),
        tar: Boolean(v.tar),
    };
    switch (verb) {
        case 'build':
            return cmdBuild(positionals, opts);
        case 'deploy':
            return cmdDeploy(positionals, opts);
        case 'run':
            if (positionals.length !== 1) {
                throw new BuildError('run takes exactly one deploy file');
            }
            return cmdRun(positionals[0]!, opts);
        case 'inspect':
            if (positionals.length === 0) {
                throw new BuildError('inspect takes at least one source path');
            }
            return cmdInspect(positionals, opts);
    }
}

try {
    await main(process.argv.slice(2));
} catch (err) {
    if (err instanceof BuildError) {
        console.error(err.message);
        process.exitCode = 1;
    } else {
        throw err;
    }
}
