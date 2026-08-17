
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as pathlib from 'node:path';
import {test} from 'node:test';

import {casExists, casInsert, casPath, casStat, casSweep} from '../cas.ts';

function makeTmpRoot(): string {
    return fs.mkdtempSync(pathlib.join(os.tmpdir(), 'cas-test-'));
}

function stage(root: string, data: string): string {
    let p = pathlib.join(root, `stage-${Math.random().toString(36).slice(2)}`);
    fs.writeFileSync(p, data);
    return p;
}

test('casInsert stores by content digest, read-only', async () => {
    let root = makeTmpRoot();
    let cas = pathlib.join(root, 'cas');
    let {digest, size} = await casInsert(cas, stage(root, 'hello'), 'png');
    assert.equal(digest, createHash('sha256').update('hello').digest('hex'));
    assert.equal(size, 5n);
    let obj = casPath(cas, digest, 'png');
    assert.equal(fs.readFileSync(obj, 'utf8'), 'hello');
    assert.equal(fs.statSync(obj).mode & 0o777, 0o444);
    assert.ok(await casExists(cas, digest, 'png'));
    assert.equal(await casStat(cas, digest, 'png'), 5n);
    assert.equal(await casStat(cas, digest, 'gif'), null);
    fs.rmSync(root, {recursive: true, force: true});
});

test('casInsert dedupes an existing object and discards the temp', async () => {
    let root = makeTmpRoot();
    let cas = pathlib.join(root, 'cas');
    let d1 = (await casInsert(cas, stage(root, 'same'), 'png')).digest;
    let tmp2 = stage(root, 'same');
    let d2 = (await casInsert(cas, tmp2, 'png')).digest;
    assert.equal(d1, d2);
    assert.ok(!fs.existsSync(tmp2));
    // Same bytes under a different extension is a distinct object.
    let d3 = (await casInsert(cas, stage(root, 'same'), 'gif')).digest;
    assert.equal(d1, d3);
    assert.ok(await casExists(cas, d1, 'png'));
    assert.ok(await casExists(cas, d1, 'gif'));
    fs.rmSync(root, {recursive: true, force: true});
});

test('casInsert replaces a corrupt object instead of trusting it', async () => {
    let root = makeTmpRoot();
    let cas = pathlib.join(root, 'cas');
    let {digest} = await casInsert(cas, stage(root, 'good bytes'), 'png');
    let obj = casPath(cas, digest, 'png');
    // Simulate a crash-truncated object under the same digest name.
    fs.chmodSync(obj, 0o644);
    fs.truncateSync(obj);
    let again = await casInsert(cas, stage(root, 'good bytes'), 'png');
    assert.equal(again.digest, digest);
    assert.equal(fs.readFileSync(obj, 'utf8'), 'good bytes');
    assert.equal(fs.statSync(obj).mode & 0o777, 0o444);
    fs.rmSync(root, {recursive: true, force: true});
});

test('casSweep removes non-live objects and prunes empty fanout dirs', async () => {
    let root = makeTmpRoot();
    let cas = pathlib.join(root, 'cas');
    let keep = (await casInsert(cas, stage(root, 'keep'), 'png')).digest;
    let drop = (await casInsert(cas, stage(root, 'drop'), 'png')).digest;
    let removed = await casSweep(cas, new Set([`${keep}.png`]));
    assert.equal(removed, 1);
    assert.ok(await casExists(cas, keep, 'png'));
    assert.ok(!await casExists(cas, drop, 'png'));
    assert.ok(!fs.existsSync(pathlib.join(cas, drop.slice(0, 2))));
    assert.ok(fs.existsSync(pathlib.join(cas, keep.slice(0, 2))));
    fs.rmSync(root, {recursive: true, force: true});
});

test('casSweep on a missing store is a no-op', async () => {
    assert.equal(await casSweep(pathlib.join(makeTmpRoot(), 'nope'), new Set()), 0);
});
