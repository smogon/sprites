
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import pathlib from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {Store} from '../store.ts';

function makeDbPath() : string {
    return pathlib.join(fs.mkdtempSync(pathlib.join(os.tmpdir(), 'store-test-')), 'db.sqlite');
}

test('recordRule/lookupRule roundtrip, upsert replaces outputs', () => {
    const store = new Store(makeDbPath());
    assert.equal(store.lookupRule('k1'), null);
    store.recordRule('k1', ['cmd a'], [{digest: 'd1', ext: 'png'}, {digest: 'd2', ext: 'css'}]);
    assert.deepEqual(store.lookupRule('k1'), [{digest: 'd1', ext: 'png'}, {digest: 'd2', ext: 'css'}]);
    store.recordRule('k1', ['cmd a'], [{digest: 'd3', ext: 'png'}, {digest: 'd4', ext: 'css'}]);
    assert.deepEqual(store.lookupRule('k1'), [{digest: 'd3', ext: 'png'}, {digest: 'd4', ext: 'css'}]);
    store.close();
});

test('deleteKeysNotIn cascades outputs; liveObjects reflects survivors', () => {
    const store = new Store(makeDbPath());
    store.recordRule('keep', ['c'], [{digest: 'da', ext: 'png'}]);
    store.recordRule('drop', ['c'], [{digest: 'db', ext: 'gif'}]);
    assert.deepEqual(store.liveObjects(), new Set(['da.png', 'db.gif']));
    assert.equal(store.deleteKeysNotIn(new Set(['keep'])), 1);
    assert.equal(store.lookupRule('drop'), null);
    assert.deepEqual(store.liveObjects(), new Set(['da.png']));
    store.close();
});

test('file cache roundtrip and prune', () => {
    const store = new Store(makeDbPath());
    const stat = {size: 5n, mtimeNs: 123n, hash: Buffer.from('aa', 'hex')};
    store.saveFileCache(new Map([['src/a.png', stat], ['src/b.png', stat]]));
    store.pruneFileCache(new Set(['src/a.png']));
    assert.deepEqual([...store.loadFileCache().keys()], ['src/a.png']);
    store.close();
});

test('migrates a v1 db: drops rule tables, keeps file_cache', () => {
    const dbPath = makeDbPath();
    const v1 = new Database(dbPath);
    v1.exec(`BEGIN;
        CREATE TABLE file_cache (
            path TEXT PRIMARY KEY, size INTEGER NOT NULL,
            mtime_ns INTEGER NOT NULL, hash BLOB NOT NULL
        ) WITHOUT ROWID;
        CREATE TABLE rules (
            id INTEGER PRIMARY KEY, key TEXT NOT NULL UNIQUE, command TEXT NOT NULL,
            display TEXT, template TEXT NOT NULL, input_sig BLOB NOT NULL,
            ok INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX rules_rename ON rules(template, input_sig);
        CREATE TABLE rule_inputs (
            rule_id INTEGER NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
            ord INTEGER NOT NULL, path TEXT NOT NULL,
            is_dep INTEGER NOT NULL DEFAULT 0, hash BLOB NOT NULL,
            PRIMARY KEY (rule_id, ord)
        );
        CREATE TABLE rule_outputs (
            rule_id INTEGER NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
            ord INTEGER NOT NULL, path TEXT NOT NULL, size INTEGER, mtime_ns INTEGER,
            PRIMARY KEY (rule_id, ord)
        );
        INSERT INTO file_cache VALUES ('src/a.png', 5, 123, x'aa');
        INSERT INTO rules (key, command, template, input_sig) VALUES ('old', 'c', 't', x'bb');
        PRAGMA user_version = 1;
    COMMIT;`);
    v1.close();

    const store = new Store(dbPath);
    assert.deepEqual([...store.loadFileCache().keys()], ['src/a.png']);
    assert.equal(store.lookupRule('old'), null);
    store.recordRule('new', ['c'], [{digest: 'd', ext: 'png'}]);
    assert.deepEqual(store.lookupRule('new'), [{digest: 'd', ext: 'png'}]);
    store.close();

    const check = new Database(dbPath);
    assert.equal(Number(check.pragma('user_version', {simple: true})), 2);
    check.close();
});

test('rejects unknown schema versions', () => {
    const dbPath = makeDbPath();
    const weird = new Database(dbPath);
    weird.exec('PRAGMA user_version = 7');
    weird.close();
    assert.throws(() => new Store(dbPath), /Unknown build db schema version 7/);
});
