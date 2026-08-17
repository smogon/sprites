
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import pathlib from 'node:path';
import {beforeEach, test} from 'node:test';

import {type Artifact, type CmdSpec, getDecls, resetDecls, rule} from '../artifact.ts';
import {casPath} from '../cas.ts';
import {type DriveResult, build} from '../driver.ts';
import {type RuleOutcome} from '../executor.ts';
import {Store} from '../store.ts';

beforeEach(resetDecls);

interface Env {
    root: string;
    dbPath: string;
    casDir: string;
    tmpDir: string;
    execLog: string;
}

function setup(): Env {
    let root = fs.mkdtempSync(pathlib.join(os.tmpdir(), 'executor-test-'));
    fs.mkdirSync(pathlib.join(root, 'src'));
    return {
        root,
        dbPath: pathlib.join(root, '.build/db.sqlite'),
        casDir: pathlib.join(root, '.build/cas'),
        tmpDir: pathlib.join(root, '.build/tmp'),
        execLog: pathlib.join(root, 'exec.log'),
    };
}

function src(env: Env, name: string, content: string): string {
    let p = pathlib.join(env.root, 'src', name);
    fs.writeFileSync(p, content);
    return p;
}

// A copy rule that also counts its executions in env.execLog.
function copyRule(env: Env, input: string | Artifact, out: string,
                  extra: Partial<CmdSpec> = {}): Artifact {
    return rule(input, {cmds: [`cat %f > %o && echo x >> ${env.execLog}`], ...extra}, out);
}

function execCount(env: Env): number {
    try {
        return fs.readFileSync(env.execLog, 'utf8').split('\n').filter(l => l !== '').length;
    } catch {
        return 0;
    }
}

async function runBuild(env: Env, opts: {dryRun?: boolean, gc?: boolean} = {},
                        decls = getDecls()): Promise<DriveResult> {
    let store = new Store(env.dbPath);
    try {
        return await build(decls, {
            root: env.root,
            store,
            casDir: env.casDir,
            tmpDir: env.tmpDir,
            jobs: 2,
            dryRun: opts.dryRun ?? false,
            failFast: false,
            verbose: false,
            gc: opts.gc ?? false,
            signal: new AbortController().signal,
            log: () => {},
            logError: () => {},
        });
    } finally {
        store.close();
    }
}

function statuses(result: DriveResult): RuleOutcome['status'][] {
    return getDecls().map(d => result.outcomes.get(d)!.status);
}

test('second build is clean and executes nothing', async () => {
    let env = setup();
    let out = copyRule(env, src(env, 'a.txt', 'hello'), 'out.txt');
    let first = await runBuild(env);
    assert.ok(first.ok);
    assert.deepEqual(statuses(first), ['ran']);
    assert.equal(fs.readFileSync(casPath(env.casDir, out.hash, 'txt'), 'utf8'), 'hello');

    resetDecls();
    copyRule(env, pathlib.join(env.root, 'src/a.txt'), 'out.txt');
    let second = await runBuild(env);
    assert.deepEqual(statuses(second), ['clean']);
    assert.equal(execCount(env), 1);
});

test('input content change reruns; gc removes the old rule and object', async () => {
    let env = setup();
    let a = src(env, 'a.txt', 'v1');
    let out1 = copyRule(env, a, 'out.txt');
    await runBuild(env, {gc: true});
    let oldObject = casPath(env.casDir, out1.hash, 'txt');

    resetDecls();
    fs.writeFileSync(a, 'v2');
    copyRule(env, a, 'out.txt');
    let result = await runBuild(env, {gc: true});
    assert.deepEqual(statuses(result), ['ran']);
    assert.equal(execCount(env), 2);
    assert.ok(!fs.existsSync(oldObject));

    let store = new Store(env.dbPath);
    assert.deepEqual(store.liveObjects().size, 1);
    store.close();
});

test('same-bytes source rename executes nothing; nameSensitive reruns', async () => {
    let env = setup();
    copyRule(env, src(env, 'a.txt', 'stable'), 'out.txt');
    copyRule(env, src(env, 'ns.txt', 'stable'), 'ns-out.txt', {nameSensitive: true});
    await runBuild(env);
    assert.equal(execCount(env), 2);

    resetDecls();
    fs.renameSync(pathlib.join(env.root, 'src/a.txt'), pathlib.join(env.root, 'src/moved.txt'));
    fs.renameSync(pathlib.join(env.root, 'src/ns.txt'), pathlib.join(env.root, 'src/ns2.txt'));
    copyRule(env, pathlib.join(env.root, 'src/moved.txt'), 'out.txt');
    copyRule(env, pathlib.join(env.root, 'src/ns2.txt'), 'ns-out.txt', {nameSensitive: true});
    let result = await runBuild(env);
    assert.deepEqual(statuses(result), ['clean', 'ran']);
    assert.equal(execCount(env), 3);
});

test('byte-identical inputs share one execution across two declarations', async () => {
    let env = setup();
    let one = copyRule(env, src(env, 'one.txt', 'same-bytes'), 'one.txt');
    let two = copyRule(env, src(env, 'two.txt', 'same-bytes'), 'two.txt');
    let result = await runBuild(env);
    assert.ok(result.ok);
    assert.equal(execCount(env), 1);
    assert.deepEqual(statuses(result).sort(), ['clean', 'ran']);
    assert.equal(one.hash, two.hash);
    assert.equal(one.filename, 'one.txt');
    assert.equal(two.filename, 'two.txt');
});

// The consumer must be a *different* computation: an identical command over
// identical bytes would share the producer's key (by design).
function upcaseRule(env: Env, input: Artifact, out: string): Artifact {
    return rule(input, [`tr a-z A-Z < %f > %o && echo x >> ${env.execLog}`], out);
}

test('chained rules: consumer follows producer, cas-missing reruns alone', async () => {
    let env = setup();
    let mid = copyRule(env, src(env, 'a.txt', 'chain'), 'mid.txt');
    upcaseRule(env, mid, 'final.txt');
    let first = await runBuild(env);
    assert.ok(first.ok);
    assert.equal(execCount(env), 2);

    resetDecls();
    let mid2 = copyRule(env, pathlib.join(env.root, 'src/a.txt'), 'mid.txt');
    let final2 = upcaseRule(env, mid2, 'final.txt');
    let clean = await runBuild(env);
    assert.deepEqual(statuses(clean), ['clean', 'clean']);
    assert.equal(fs.readFileSync(casPath(env.casDir, final2.hash, 'txt'), 'utf8'), 'CHAIN');

    resetDecls();
    fs.rmSync(casPath(env.casDir, final2.hash, 'txt'));
    let mid3 = copyRule(env, pathlib.join(env.root, 'src/a.txt'), 'mid.txt');
    upcaseRule(env, mid3, 'final.txt');
    let rerun = await runBuild(env);
    assert.deepEqual(statuses(rerun), ['clean', 'ran']);
    let outcome = rerun.outcomes.get(getDecls()[1]!)!;
    assert.deepEqual(outcome, {status: 'ran', reason: 'cas-missing'});
});

test('failed producer blocks the consumer; nothing is recorded', async () => {
    let env = setup();
    let bad = rule(src(env, 'a.txt', 'x'), ['false'], 'mid.txt');
    copyRule(env, bad, 'final.txt');
    let result = await runBuild(env);
    assert.ok(!result.ok);
    assert.deepEqual(statuses(result), ['failed', 'blocked']);
    let store = new Store(env.dbPath);
    assert.equal(store.liveObjects().size, 0);
    store.close();
});

test('multi-output rules route %oN and skip all-or-nothing', async () => {
    let env = setup();
    let declare = () => rule(src(env, 'a.txt', 'multi'),
        [`printf one > %o1 && printf two > %o2 && echo x >> ${env.execLog}`],
        ['x.txt', 'y.css']);
    let [x1, y1] = declare();
    await runBuild(env);
    assert.equal(fs.readFileSync(casPath(env.casDir, x1.hash, 'txt'), 'utf8'), 'one');
    assert.equal(fs.readFileSync(casPath(env.casDir, y1.hash, 'css'), 'utf8'), 'two');

    resetDecls();
    fs.rmSync(casPath(env.casDir, y1.hash, 'css'));
    declare();
    let rerun = await runBuild(env);
    assert.deepEqual(statuses(rerun), ['ran']);
    assert.equal(execCount(env), 2);
});

test('a missing declared output fails the rule', async () => {
    let env = setup();
    rule(src(env, 'a.txt', 'x'), ['printf one > %o1'], ['x.txt', 'missing.css']);
    let result = await runBuild(env);
    assert.ok(!result.ok);
    let outcome = result.outcomes.get(getDecls()[0]!)!;
    assert.equal(outcome.status, 'failed');
    assert.match((outcome as {message: string}).message, /did not produce: missing.css/);
    let store = new Store(env.dbPath);
    assert.equal(store.liveObjects().size, 0);
    store.close();
});

test('dry run reports without writing state', async () => {
    let env = setup();
    let mid = copyRule(env, src(env, 'a.txt', 'dry'), 'mid.txt');
    copyRule(env, mid, 'final.txt');
    let result = await runBuild(env, {dryRun: true});
    assert.ok(!result.ok);
    assert.deepEqual(result.outcomes.get(getDecls()[0]!), {status: 'would-run', reason: 'new'});
    assert.deepEqual(result.outcomes.get(getDecls()[1]!), {status: 'would-run', reason: 'blocked'});
    assert.equal(execCount(env), 0);
    assert.ok(!fs.existsSync(env.casDir));
    let store = new Store(env.dbPath);
    assert.equal(store.liveObjects().size, 0);
    store.close();
});

test('a truncated CAS object reads as dirty and is repaired', async () => {
    let env = setup();
    let out = copyRule(env, src(env, 'a.txt', 'truncate-me'), 'out.txt');
    await runBuild(env);
    let obj = casPath(env.casDir, out.hash, 'txt');
    fs.chmodSync(obj, 0o644);
    fs.truncateSync(obj);

    resetDecls();
    copyRule(env, pathlib.join(env.root, 'src/a.txt'), 'out.txt');
    let rerun = await runBuild(env);
    assert.deepEqual(statuses(rerun), ['ran']);
    assert.equal(fs.readFileSync(obj, 'utf8'), 'truncate-me');
    assert.equal(fs.statSync(obj).mode & 0o777, 0o444);
});

test('building a consumer alone pulls in and hashes its producer', async () => {
    let env = setup();
    let mid = copyRule(env, src(env, 'a.txt', 'solo'), 'mid.txt');
    let final = rule(mid, [`tr a-z A-Z < %f > %o && echo x >> ${env.execLog}`], 'final.txt');
    let result = await runBuild(env, {}, [final.decl]);
    assert.ok(result.ok);
    assert.equal(execCount(env), 2);
    assert.equal(fs.readFileSync(casPath(env.casDir, final.hash, 'txt'), 'utf8'), 'SOLO');
});

test('missing sources fail upfront', async () => {
    let env = setup();
    copyRule(env, pathlib.join(env.root, 'src/nope.txt'), 'out.txt');
    await assert.rejects(() => runBuild(env), /Missing input files/);
});
