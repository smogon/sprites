
import fs from 'fs';
import pathlib from 'path';
import {DatabaseSync} from 'node:sqlite';

import {BuildError} from './errors.ts';
import type {FileStat} from './hash.ts';

export interface StoredOutput {
    digest: string;   // sha256 hex of the bytes; the CAS object is <digest>.<ext>
    ext: string;
    size: bigint;     // verified against the object on every clean check
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
    size    INTEGER NOT NULL,
    PRIMARY KEY (rule_id, ord)
);
`;

function userVersion(db: DatabaseSync): number {
    const row = db.prepare('PRAGMA user_version').get() as {user_version: bigint | number};
    return Number(row.user_version);
}

export class Store {
    private db: DatabaseSync;

    constructor(dbPath: string) {
        fs.mkdirSync(pathlib.dirname(dbPath), {recursive: true});
        this.db = new DatabaseSync(dbPath, {readBigInts: true});
        this.db.exec('PRAGMA journal_mode = WAL');
        this.db.exec('PRAGMA foreign_keys = ON');
        this.db.exec('PRAGMA synchronous = NORMAL');
        this.migrate();
    }

    private transaction<T>(fn: () => T): T {
        this.db.exec('BEGIN');
        try {
            const result = fn();
            this.db.exec('COMMIT');
            return result;
        } catch (err) {
            this.db.exec('ROLLBACK');
            throw err;
        }
    }

    private migrate(): void {
        const version = userVersion(this.db);
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

    loadFileCache(): Map<string, FileStat> {
        const result = new Map<string, FileStat>();
        const rows = this.db.prepare('SELECT path, size, mtime_ns, hash FROM file_cache').all() as
            unknown as {path: string, size: bigint, mtime_ns: bigint, hash: Uint8Array}[];
        for (const row of rows) {
            const h = row.hash;
            result.set(row.path, {size: row.size, mtimeNs: row.mtime_ns,
                hash: Buffer.from(h.buffer, h.byteOffset, h.byteLength)});
        }
        return result;
    }

    saveFileCache(entries: Map<string, FileStat>): void {
        const upsert = this.db.prepare(`
            INSERT INTO file_cache (path, size, mtime_ns, hash) VALUES (?, ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
                size = excluded.size, mtime_ns = excluded.mtime_ns, hash = excluded.hash`);
        this.transaction(() => {
            for (const [path, stat] of entries) {
                upsert.run(path, stat.size, stat.mtimeNs, stat.hash);
            }
        });
    }

    pruneFileCache(live: Set<string>): void {
        const paths = this.db.prepare('SELECT path FROM file_cache').all() as
            unknown as {path: string}[];
        const del = this.db.prepare('DELETE FROM file_cache WHERE path = ?');
        this.transaction(() => {
            for (const {path} of paths) {
                if (!live.has(path)) {
                    del.run(path);
                }
            }
        });
    }

    lookupRule(key: string): StoredOutput[] | null {
        return this.transaction(() => {
            const rule = this.db.prepare('SELECT id FROM rules WHERE key = ?').get(key) as
                {id: bigint} | undefined;
            if (rule === undefined) {
                return null;
            }
            const rows = this.db.prepare(
                'SELECT digest, ext, size FROM rule_outputs WHERE rule_id = ? ORDER BY ord')
                .all(rule.id) as unknown as StoredOutput[];
            // node:sqlite rows have a null prototype; return plain objects.
            return rows.map(r => ({digest: r.digest, ext: r.ext, size: r.size}));
        });
    }

    // One transaction per completed rule: an interrupted build only ever
    // contains fully-recorded rules.
    recordRule(key: string, cmds: string[], outputs: StoredOutput[]): void {
        const upsert = this.db.prepare(`
            INSERT INTO rules (key, cmds) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET cmds = excluded.cmds
            RETURNING id`);
        const delOutputs = this.db.prepare('DELETE FROM rule_outputs WHERE rule_id = ?');
        const insOutput = this.db.prepare(
            'INSERT INTO rule_outputs (rule_id, ord, digest, ext, size) VALUES (?, ?, ?, ?, ?)');
        this.transaction(() => {
            const {id} = upsert.get(key, cmds.join('\n')) as {id: bigint};
            delOutputs.run(id);
            outputs.forEach((o, i) => insOutput.run(id, i, o.digest, o.ext, o.size));
        });
    }

    // GC: drop every rule whose key is not live. Returns the removal count.
    deleteKeysNotIn(live: Set<string>): number {
        const keys = this.db.prepare('SELECT id, key FROM rules').all() as
            unknown as {id: bigint, key: string}[];
        const del = this.db.prepare('DELETE FROM rules WHERE id = ?');
        let removed = 0;
        this.transaction(() => {
            for (const {id, key} of keys) {
                if (!live.has(key)) {
                    del.run(id);
                    removed++;
                }
            }
        });
        return removed;
    }

    // Every CAS object referenced by some rule, as "<digest>.<ext>" basenames.
    liveObjects(): Set<string> {
        const rows = this.db.prepare('SELECT digest, ext FROM rule_outputs').all() as
            unknown as {digest: string, ext: string}[];
        return new Set(rows.map(r => `${r.digest}.${r.ext}`));
    }

    close(): void {
        this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
        this.db.close();
    }
}

// Schema version of an existing db, without opening it for writing (the
// Store constructor migrates); null if there is no db.
export function dbVersion(dbPath: string): number | null {
    if (!fs.existsSync(dbPath)) {
        return null;
    }
    const db = new DatabaseSync(dbPath, {readOnly: true});
    try {
        return userVersion(db);
    } finally {
        db.close();
    }
}

// Guards against two concurrent builds; the exclusive transaction is released
// by the OS on any crash, so there are no stale lock files.
export function acquireLock(lockPath: string): () => void {
    fs.mkdirSync(pathlib.dirname(lockPath), {recursive: true});
    const lock = new DatabaseSync(lockPath, {timeout: 0});
    try {
        lock.exec('BEGIN EXCLUSIVE');
    } catch (err) {
        lock.close();
        if ((err as {errcode?: number}).errcode === 5) { // SQLITE_BUSY
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
