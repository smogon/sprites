
import fs from 'fs';
import pathlib from 'path';
import Database from 'better-sqlite3';

import type {RuleDecl} from './api.ts';
import type {FileStat} from './hash.ts';
import {BuildError} from './graph.ts';

export interface StoredRuleInput {
    path : string;
    isDep : boolean;
    hash : Buffer;
}

export interface StoredRuleOutput {
    path : string;
    size : bigint | null;     // null when the rule last failed
    mtimeNs : bigint | null;
}

export interface StoredRule {
    id : bigint;
    key : string;
    command : string;
    display : string | null;
    template : string;
    inputSig : Buffer;
    ok : boolean;
    inputs : StoredRuleInput[];    // ordered: inputs (in %f order), then deps
    outputs : StoredRuleOutput[];  // ordered: position-mapped for renames
}

export interface RecordedOutput {
    path : string;
    size : bigint;
    mtimeNs : bigint;
}

const DDL = `
CREATE TABLE IF NOT EXISTS file_cache (
    path     TEXT PRIMARY KEY,
    size     INTEGER NOT NULL,
    mtime_ns INTEGER NOT NULL,
    hash     BLOB NOT NULL
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS rules (
    id        INTEGER PRIMARY KEY,
    key       TEXT NOT NULL UNIQUE,
    command   TEXT NOT NULL,
    display   TEXT,
    template  TEXT NOT NULL,
    input_sig BLOB NOT NULL,
    ok        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS rules_rename ON rules(template, input_sig);

CREATE TABLE IF NOT EXISTS rule_inputs (
    rule_id INTEGER NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
    ord     INTEGER NOT NULL,
    path    TEXT NOT NULL,
    is_dep  INTEGER NOT NULL DEFAULT 0,
    hash    BLOB NOT NULL,
    PRIMARY KEY (rule_id, ord)
);
CREATE INDEX IF NOT EXISTS rule_inputs_path ON rule_inputs(path);

CREATE TABLE IF NOT EXISTS rule_outputs (
    rule_id  INTEGER NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
    ord      INTEGER NOT NULL,
    path     TEXT NOT NULL,
    size     INTEGER,
    mtime_ns INTEGER,
    PRIMARY KEY (rule_id, ord)
);
CREATE INDEX IF NOT EXISTS rule_outputs_path ON rule_outputs(path);
`;

export class BuildDb {
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
            this.db.exec('BEGIN;' + DDL + 'PRAGMA user_version = 1; COMMIT;');
        } else if (version !== 1) {
            throw new BuildError(
                `Unknown build db schema version ${version}; delete .build/ and re-run with --adopt`);
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

    loadStoredRules() : StoredRule[] {
        // One transaction: the three queries must see a single snapshot, or a
        // concurrent writer (e.g. a build racing a dry run) tears the view.
        return this.db.transaction(() => this.loadStoredRulesInner())();
    }

    private loadStoredRulesInner() : StoredRule[] {
        const byId = new Map<bigint, StoredRule>();
        const ruleRows = this.db.prepare<[], {
            id : bigint, key : string, command : string, display : string | null,
            template : string, input_sig : Buffer, ok : bigint,
        }>('SELECT id, key, command, display, template, input_sig, ok FROM rules').all();
        for (const row of ruleRows) {
            byId.set(row.id, {
                id: row.id,
                key: row.key,
                command: row.command,
                display: row.display,
                template: row.template,
                inputSig: row.input_sig,
                ok: row.ok !== 0n,
                inputs: [],
                outputs: [],
            });
        }
        const inputRows = this.db.prepare<[], {rule_id : bigint, path : string, is_dep : bigint, hash : Buffer}>(
            'SELECT rule_id, path, is_dep, hash FROM rule_inputs ORDER BY rule_id, ord').all();
        for (const row of inputRows) {
            byId.get(row.rule_id)!.inputs.push({path: row.path, isDep: row.is_dep !== 0n, hash: row.hash});
        }
        const outputRows = this.db.prepare<[], {rule_id : bigint, path : string, size : bigint | null, mtime_ns : bigint | null}>(
            'SELECT rule_id, path, size, mtime_ns FROM rule_outputs ORDER BY rule_id, ord').all();
        for (const row of outputRows) {
            byId.get(row.rule_id)!.outputs.push({path: row.path, size: row.size, mtimeNs: row.mtime_ns});
        }
        return [...byId.values()];
    }

    // One transaction per completed rule: an interrupted build only ever
    // contains fully-recorded rules. outputs === null records a failure (ok=0,
    // output paths kept for GC, stats nulled so the rule stays dirty).
    recordRuleResult(decl : RuleDecl, inputHashes : Map<string, Buffer>, sig : Buffer,
                     outputs : RecordedOutput[] | null) : void {
        const ok = outputs !== null;
        const upsert = this.db.prepare<[string, string, string | null, string, Buffer, bigint], {id : bigint}>(`
            INSERT INTO rules (key, command, display, template, input_sig, ok)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                display = excluded.display, input_sig = excluded.input_sig, ok = excluded.ok
            RETURNING id`);
        const delInputs = this.db.prepare('DELETE FROM rule_inputs WHERE rule_id = ?');
        const delOutputs = this.db.prepare('DELETE FROM rule_outputs WHERE rule_id = ?');
        const insInput = this.db.prepare(
            'INSERT INTO rule_inputs (rule_id, ord, path, is_dep, hash) VALUES (?, ?, ?, ?, ?)');
        const insOutput = this.db.prepare(
            'INSERT INTO rule_outputs (rule_id, ord, path, size, mtime_ns) VALUES (?, ?, ?, ?, ?)');
        this.db.transaction(() => {
            const {id} = upsert.get(decl.key, decl.command, decl.display, decl.template,
                                    sig, ok ? 1n : 0n)!;
            delInputs.run(id);
            delOutputs.run(id);
            let ord = 0;
            for (const path of decl.inputs) {
                insInput.run(id, ord++, path, 0, inputHashes.get(path)!);
            }
            for (const path of decl.deps) {
                insInput.run(id, ord++, path, 1, inputHashes.get(path)!);
            }
            const outputRows = outputs ?? decl.outputs.map(path => ({path, size: null, mtimeNs: null}));
            outputRows.forEach((o, i) => insOutput.run(id, i, o.path, o.size, o.mtimeNs));
        })();
    }

    deleteRule(id : bigint) : void {
        this.db.prepare('DELETE FROM rules WHERE id = ?').run(id);
    }

    close() : void {
        this.db.pragma('wal_checkpoint(TRUNCATE)');
        this.db.close();
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
