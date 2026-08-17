
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import pathlib from 'node:path';
import {test} from 'node:test';

import {casExists, casInsert, casPath, casStat, casSweep} from '../cas.ts';

function makeTmpRoot() : string {
    return fs.mkdtempSync(pathlib.join(os.tmpdir(), 'cas-test-'));
}

function stage(root : string, data : string) : string {
    const p = pathlib.join(root, `stage-${Math.random().toString(36).slice(2)}`);
    fs.writeFileSync(p, data);
    return p;
}

test('casInsert stores by content digest, read-only', () => {
    const root = makeTmpRoot();
    const cas = pathlib.join(root, 'cas');
    const {digest, size} = casInsert(cas, stage(root, 'hello'), 'png');
    assert.equal(digest, createHash('sha256').update('hello').digest('hex'));
    assert.equal(size, 5n);
    const obj = casPath(cas, digest, 'png');
    assert.equal(fs.readFileSync(obj, 'utf8'), 'hello');
    assert.equal(fs.statSync(obj).mode & 0o777, 0o444);
    assert.ok(casExists(cas, digest, 'png'));
    assert.equal(casStat(cas, digest, 'png'), 5n);
    assert.equal(casStat(cas, digest, 'gif'), null);
    fs.rmSync(root, {recursive: true, force: true});
});

test('casInsert dedupes an existing object and discards the temp', () => {
    const root = makeTmpRoot();
    const cas = pathlib.join(root, 'cas');
    const d1 = casInsert(cas, stage(root, 'same'), 'png').digest;
    const tmp2 = stage(root, 'same');
    const d2 = casInsert(cas, tmp2, 'png').digest;
    assert.equal(d1, d2);
    assert.ok(!fs.existsSync(tmp2));
    // Same bytes under a different extension is a distinct object.
    const d3 = casInsert(cas, stage(root, 'same'), 'gif').digest;
    assert.equal(d1, d3);
    assert.ok(casExists(cas, d1, 'png'));
    assert.ok(casExists(cas, d1, 'gif'));
    fs.rmSync(root, {recursive: true, force: true});
});

test('casInsert replaces a corrupt object instead of trusting it', () => {
    const root = makeTmpRoot();
    const cas = pathlib.join(root, 'cas');
    const {digest} = casInsert(cas, stage(root, 'good bytes'), 'png');
    const obj = casPath(cas, digest, 'png');
    // Simulate a crash-truncated object under the same digest name.
    fs.chmodSync(obj, 0o644);
    fs.truncateSync(obj);
    const again = casInsert(cas, stage(root, 'good bytes'), 'png');
    assert.equal(again.digest, digest);
    assert.equal(fs.readFileSync(obj, 'utf8'), 'good bytes');
    assert.equal(fs.statSync(obj).mode & 0o777, 0o444);
    fs.rmSync(root, {recursive: true, force: true});
});

test('casSweep removes non-live objects and prunes empty fanout dirs', () => {
    const root = makeTmpRoot();
    const cas = pathlib.join(root, 'cas');
    const keep = casInsert(cas, stage(root, 'keep'), 'png').digest;
    const drop = casInsert(cas, stage(root, 'drop'), 'png').digest;
    const removed = casSweep(cas, new Set([`${keep}.png`]));
    assert.equal(removed, 1);
    assert.ok(casExists(cas, keep, 'png'));
    assert.ok(!casExists(cas, drop, 'png'));
    assert.ok(!fs.existsSync(pathlib.join(cas, drop.slice(0, 2))));
    assert.ok(fs.existsSync(pathlib.join(cas, keep.slice(0, 2))));
    fs.rmSync(root, {recursive: true, force: true});
});

test('casSweep on a missing store is a no-op', () => {
    assert.equal(casSweep(pathlib.join(makeTmpRoot(), 'nope'), new Set()), 0);
});
