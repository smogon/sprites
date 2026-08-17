
import fs from 'fs';
import pathlib from 'path';
import Database from 'better-sqlite3';

import {BuildError} from './errors.ts';
import type {FileStat} from './hash.ts';

export interface StoredOutput {
    digest : string;   // sha256 hex of the bytes; the CAS object is <digest>.<ext>
    ext : string;
}

const DDL = `
CREATE TABLE IF NOT EXISTS file_cache (
    path     TEXT PRIMARY KEY,
    size     INTEGER NOT NULL,
    mtime_ns INTEGER NOT NULL,
    hash     BLOB NOT NULL
) WITHOUT ROWID;

-- One row per successful rule execution, keyed by the identity hash
-- (command templates + input digests/exts + dep digests + output exts).
-- The key is the entire dirty check; failures are never recorded.
CREATE TABLE IF NOT EXISTS rules (
    id   INTEGER PRIMARY KEY,
    key  TEXT NOT NULL UNIQUE,
    cmds TEXT NOT NULL          -- pre-substitution templates; debugging only
);

CREATE TABLE IF NOT EXISTS rule_outputs (
    rule_id INTEGER NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
    ord     INTEGER NOT NULL,
    digest  TEXT NOT NULL,
    ext     TEXT NOT NULL,
    PRIMARY KEY (rule_id, ord)
);
`;

export class Store {
    private db : Database.Database;

    constructor(dbPath : string) {
        fs.mkdirSync(pathlib.dirname(dbPath), {recursive: true});
        this.db = new Database(dbPath);
        this.db.defaultSafeIntegers(true);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
        this.db.pragma('synchronous = NORMAL');
        this.migrate();
    }

    private migrate() : void {
        const version = Number(this.db.pragma('user_version', {simple: true}));
        if (version === 0) {
            this.db.exec('BEGIN;' + DDL + 'PRAGMA user_version = 2; COMMIT;');
        } else if (version === 1) {
            // v1 stored fixed-name outputs and per-input hashes; none of it
            // maps to the content-addressed model. Keep the file_cache (same
            // schema, saves rehashing every source) and drop the rest.
            this.db.exec(`BEGIN;
                DROP TABLE rule_inputs;
                DROP TABLE rule_outputs;
                DROP TABLE rules;
                ${DDL}
                PRAGMA user_version = 2;
            COMMIT;`);
        } else if (version !== 2) {
            throw new BuildError(`Unknown build db schema version ${version}; delete .build/ and rebuild`);
        }
    }

    loadFileCache() : Map<string, FileStat> {
        const result = new Map<string, FileStat>();
        const rows = this.db.prepare<[], {path : string, size : bigint, mtime_ns : bigint, hash : Buffer}>(
            'SELECT path, size, mtime_ns, hash FROM file_cache').all();
        for (const row of rows) {
            result.set(row.path, {size: row.size, mtimeNs: row.mtime_ns, hash: row.hash});
        }
        return result;
    }

    saveFileCache(entries : Map<string, FileStat>) : void {
        const upsert = this.db.prepare(`
            INSERT INTO file_cache (path, size, mtime_ns, hash) VALUES (?, ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
                size = excluded.size, mtime_ns = excluded.mtime_ns, hash = excluded.hash`);
        this.db.transaction(() => {
            for (const [path, stat] of entries) {
                upsert.run(path, stat.size, stat.mtimeNs, stat.hash);
            }
        })();
    }

    pruneFileCache(live : Set<string>) : void {
        const paths = this.db.prepare<[], {path : string}>('SELECT path FROM file_cache').all();
        const del = this.db.prepare('DELETE FROM file_cache WHERE path = ?');
        this.db.transaction(() => {
            for (const {path} of paths) {
                if (!live.has(path)) {
                    del.run(path);
                }
            }
        })();
    }

    lookupRule(key : string) : StoredOutput[] | null {
        return this.db.transaction(() => {
            const rule = this.db.prepare<[string], {id : bigint}>(
                'SELECT id FROM rules WHERE key = ?').get(key);
            if (rule === undefined) {
                return null;
            }
            return this.db.prepare<[bigint], {digest : string, ext : string}>(
                'SELECT digest, ext FROM rule_outputs WHERE rule_id = ? ORDER BY ord').all(rule.id);
        })();
    }

    // One transaction per completed rule: an interrupted build only ever
    // contains fully-recorded rules.
    recordRule(key : string, cmds : string[], outputs : StoredOutput[]) : void {
        const upsert = this.db.prepare<[string, string], {id : bigint}>(`
            INSERT INTO rules (key, cmds) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET cmds = excluded.cmds
            RETURNING id`);
        const delOutputs = this.db.prepare('DELETE FROM rule_outputs WHERE rule_id = ?');
        const insOutput = this.db.prepare(
            'INSERT INTO rule_outputs (rule_id, ord, digest, ext) VALUES (?, ?, ?, ?)');
        this.db.transaction(() => {
            const {id} = upsert.get(key, cmds.join('\n'))!;
            delOutputs.run(id);
            outputs.forEach((o, i) => insOutput.run(id, i, o.digest, o.ext));
        })();
    }

    // GC: drop every rule whose key is not live. Returns the removal count.
    deleteKeysNotIn(live : Set<string>) : number {
        const keys = this.db.prepare<[], {id : bigint, key : string}>('SELECT id, key FROM rules').all();
        const del = this.db.prepare('DELETE FROM rules WHERE id = ?');
        let removed = 0;
        this.db.transaction(() => {
            for (const {id, key} of keys) {
                if (!live.has(key)) {
                    del.run(id);
                    removed++;
                }
            }
        })();
        return removed;
    }

    // Every CAS object referenced by some rule, as "<digest>.<ext>" basenames.
    liveObjects() : Set<string> {
        const rows = this.db.prepare<[], {digest : string, ext : string}>(
            'SELECT digest, ext FROM rule_outputs').all();
        return new Set(rows.map(r => `${r.digest}.${r.ext}`));
    }

    close() : void {
        this.db.pragma('wal_checkpoint(TRUNCATE)');
        this.db.close();
    }
}

// Schema version of an existing db, without opening it for writing (the
// Store constructor migrates); null if there is no db.
export function dbVersion(dbPath : string) : number | null {
    if (!fs.existsSync(dbPath)) {
        return null;
    }
    const db = new Database(dbPath, {readonly: true});
    try {
        return Number(db.pragma('user_version', {simple: true}));
    } finally {
        db.close();
    }
}

// Guards against two concurrent builds; the exclusive transaction is released
// by the OS on any crash, so there are no stale lock files.
export function acquireLock(lockPath : string) : () => void {
    fs.mkdirSync(pathlib.dirname(lockPath), {recursive: true});
    const lock = new Database(lockPath, {timeout: 0});
    try {
        lock.exec('BEGIN EXCLUSIVE');
    } catch (err) {
        lock.close();
        if ((err as {code? : string}).code === 'SQLITE_BUSY') {
            throw new BuildError('Another build is already running.');
        }
        throw err;
    }
    return () => {
        try {
            lock.exec('COMMIT');
        } catch {}
        lock.close();
    };
}
