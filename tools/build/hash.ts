
import fs from 'fs';
import {createHash} from 'crypto';

export interface FileStat {
    size : bigint;
    mtimeNs : bigint;
    hash : Buffer;
}

export function hashFileSync(path : string) : Buffer {
    return createHash('sha256').update(fs.readFileSync(path)).digest();
}

export interface ReconcileResult {
    hashes : Map<string, Buffer>;      // current content hash for every extant path
    updated : Map<string, FileStat>;   // cache entries that changed (to persist)
    missing : string[];                // paths that don't exist or aren't files
}

// Content hashes with a stat cache: only files whose (size, mtime_ns) changed
// since the recorded cache entry are rehashed. mtime_ns exceeds 2^53, hence
// bigint stats throughout.
export function reconcileHashes(paths : Iterable<string>, cache : Map<string, FileStat>) : ReconcileResult {
    const hashes = new Map<string, Buffer>();
    const updated = new Map<string, FileStat>();
    const missing = [];
    for (const path of paths) {
        let st;
        try {
            st = fs.statSync(path, {bigint: true});
        } catch {
            missing.push(path);
            continue;
        }
        if (!st.isFile()) {
            missing.push(path);
            continue;
        }
        const cached = cache.get(path);
        let hash;
        if (cached !== undefined && cached.size === st.size && cached.mtimeNs === st.mtimeNs) {
            hash = cached.hash;
        } else {
            hash = hashFileSync(path);
            updated.set(path, {size: st.size, mtimeNs: st.mtimeNs, hash});
        }
        hashes.set(path, hash);
    }
    return {hashes, updated, missing};
}
