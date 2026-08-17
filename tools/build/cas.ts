
import * as fs from 'node:fs';
import * as pathlib from 'node:path';

import {hashFileSync} from './hash.ts';

// Content-addressed store for build outputs. Objects live at
// <casDir>/<hh>/<sha256hex>.<ext> (hh = first two hex chars), carry their
// extension so format-sniffing tools can consume them directly, and are
// read-only: a command substituting a CAS path for %f cannot corrupt the
// store. Writers stage the file elsewhere on the same filesystem and insert
// it with an atomic rename.

export function casPath(casDir: string, digest: string, ext: string): string {
    return pathlib.join(casDir, digest.slice(0, 2), `${digest}.${ext}`);
}

export function casExists(casDir: string, digest: string, ext: string): boolean {
    return casStat(casDir, digest, ext) !== null;
}

// Size of an object, or null if absent. Callers verify it against the
// recorded size: a crash between rename and data flush can leave a
// truncated object, which must read as dirty, not clean.
export function casStat(casDir: string, digest: string, ext: string): bigint | null {
    try {
        let st = fs.statSync(casPath(casDir, digest, ext), {bigint: true});
        return st.isFile() ? st.size : null;
    } catch {
        return null;
    }
}

export type CasObject = {
    digest: string;   // sha256 hex of the bytes
    size: bigint,
};

// Move tmpPath into the store, returning the content digest and size. An
// existing object is trusted only if its bytes actually hash to the digest;
// otherwise (crash-truncated object) the fresh bytes replace it.
export function casInsert(casDir: string, tmpPath: string, ext: string): CasObject {
    let digest = hashFileSync(tmpPath).toString('hex');
    let size = fs.statSync(tmpPath, {bigint: true}).size;
    let target = casPath(casDir, digest, ext);
    if (fs.existsSync(target) && hashFileSync(target).toString('hex') === digest) {
        fs.unlinkSync(tmpPath);
        return {digest, size};
    }
    fs.mkdirSync(pathlib.dirname(target), {recursive: true});
    fs.chmodSync(tmpPath, 0o444);
    // Flush the bytes before the rename becomes visible, so a power loss
    // cannot journal the rename while dropping the data pages.
    let fd = fs.openSync(tmpPath, 'r');
    try {
        fs.fsyncSync(fd);
    } finally {
        fs.closeSync(fd);
    }
    fs.renameSync(tmpPath, target);
    return {digest, size};
}

// Remove every object not in `live` (keys are "<digest>.<ext>", the object
// basename) and prune emptied fanout directories. Returns the removal count.
export function casSweep(casDir: string, live: Set<string>): number {
    let removed = 0;
    let fanout: fs.Dirent[];
    try {
        fanout = fs.readdirSync(casDir, {withFileTypes: true});
    } catch (err) {
        if ((err as {code?: string}).code === 'ENOENT') {
            return 0;
        }
        throw err;
    }
    for (let dir of fanout) {
        if (!dir.isDirectory()) {
            continue;
        }
        let dirPath = pathlib.join(casDir, dir.name);
        for (let name of fs.readdirSync(dirPath)) {
            if (!live.has(name)) {
                fs.unlinkSync(pathlib.join(dirPath, name));
                removed++;
            }
        }
        try {
            fs.rmdirSync(dirPath);
        } catch {
            // not empty
        }
    }
    return removed;
}
