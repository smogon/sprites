
import fs from 'fs';
import pathlib from 'path';

import {hashFileSync} from './hash.ts';

// Content-addressed store for build outputs. Objects live at
// <casDir>/<hh>/<sha256hex>.<ext> (hh = first two hex chars), carry their
// extension so format-sniffing tools can consume them directly, and are
// read-only: a command substituting a CAS path for %f cannot corrupt the
// store. Writers stage the file elsewhere on the same filesystem and insert
// it with an atomic rename.

export function casPath(casDir : string, digest : string, ext : string) : string {
    return pathlib.join(casDir, digest.slice(0, 2), `${digest}.${ext}`);
}

export function casExists(casDir : string, digest : string, ext : string) : boolean {
    try {
        return fs.statSync(casPath(casDir, digest, ext)).isFile();
    } catch {
        return false;
    }
}

// Move tmpPath into the store, returning the content digest (hex). If the
// object already exists the temp file is simply discarded.
export function casInsert(casDir : string, tmpPath : string, ext : string) : string {
    const digest = hashFileSync(tmpPath).toString('hex');
    const target = casPath(casDir, digest, ext);
    if (fs.existsSync(target)) {
        fs.unlinkSync(tmpPath);
        return digest;
    }
    fs.mkdirSync(pathlib.dirname(target), {recursive: true});
    fs.chmodSync(tmpPath, 0o444);
    fs.renameSync(tmpPath, target);
    return digest;
}

// Remove every object not in `live` (keys are "<digest>.<ext>", the object
// basename) and prune emptied fanout directories. Returns the removal count.
export function casSweep(casDir : string, live : Set<string>) : number {
    let removed = 0;
    let fanout : fs.Dirent[];
    try {
        fanout = fs.readdirSync(casDir, {withFileTypes: true});
    } catch (err) {
        if ((err as {code? : string}).code === 'ENOENT') {
            return 0;
        }
        throw err;
    }
    for (const dir of fanout) {
        if (!dir.isDirectory()) {
            continue;
        }
        const dirPath = pathlib.join(casDir, dir.name);
        for (const name of fs.readdirSync(dirPath)) {
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
