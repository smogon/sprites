
import * as fs from 'node:fs/promises';
import * as pathlib from 'node:path';

import {hashFile} from './hash.ts';

// Content-addressed store for build outputs. Objects live at
// <casDir>/<hh>/<sha256hex>.<ext> (hh = first two hex chars), carry their
// extension so format-sniffing tools can consume them directly, and are
// read-only: a command substituting a CAS path for %f cannot corrupt the
// store. Writers stage the file elsewhere on the same filesystem and insert
// it with an atomic rename.

export function casPath(casDir: string, digest: string, ext: string): string {
    return pathlib.join(casDir, digest.slice(0, 2), `${digest}.${ext}`);
}

export async function casExists(casDir: string, digest: string, ext: string): Promise<boolean> {
    return await casStat(casDir, digest, ext) !== null;
}

// Size of an object, or null if absent. Callers verify it against the
// recorded size: a crash between rename and data flush can leave a
// truncated object, which must read as dirty, not clean.
export async function casStat(casDir: string, digest: string, ext: string): Promise<bigint | null> {
    try {
        let st = await fs.stat(casPath(casDir, digest, ext), {bigint: true});
        return st.isFile() ? st.size : null;
    } catch {
        return null;
    }
}

export type CasObject = {
    digest: string,   // sha256 hex of the bytes
    size: bigint,
};

async function exists(path: string): Promise<boolean> {
    try {
        await fs.access(path);
        return true;
    } catch {
        return false;
    }
}

// Move tmpPath into the store, returning the content digest and size. An
// existing object is trusted only if its bytes actually hash to the digest;
// otherwise (crash-truncated object) the fresh bytes replace it.
export async function casInsert(casDir: string, tmpPath: string, ext: string): Promise<CasObject> {
    let digest = (await hashFile(tmpPath)).toString('hex');
    let size = (await fs.stat(tmpPath, {bigint: true})).size;
    let target = casPath(casDir, digest, ext);
    if (await exists(target) && (await hashFile(target)).toString('hex') === digest) {
        await fs.unlink(tmpPath);
        return {digest, size};
    }
    await fs.mkdir(pathlib.dirname(target), {recursive: true});
    await fs.chmod(tmpPath, 0o444);
    // Flush the bytes before the rename becomes visible, so a power loss
    // cannot journal the rename while dropping the data pages.
    let fh = await fs.open(tmpPath, 'r');
    try {
        await fh.sync();
    } finally {
        await fh.close();
    }
    await fs.rename(tmpPath, target);
    return {digest, size};
}

// Remove every object not in `live` (keys are "<digest>.<ext>", the object
// basename) and prune emptied fanout directories. Returns the removal count.
export async function casSweep(casDir: string, live: Set<string>): Promise<number> {
    let removed = 0;
    let fanout;
    try {
        fanout = await fs.readdir(casDir, {withFileTypes: true});
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
        for (let name of await fs.readdir(dirPath)) {
            if (!live.has(name)) {
                await fs.unlink(pathlib.join(dirPath, name));
                removed++;
            }
        }
        try {
            await fs.rmdir(dirPath);
        } catch {
            // not empty
        }
    }
    return removed;
}
