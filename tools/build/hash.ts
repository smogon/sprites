
import {createHash} from 'node:crypto';
import * as fs from 'node:fs/promises';

export type FileStat = {
    size: bigint,
    mtimeNs: bigint,
    hash: Buffer,
};

export async function hashFile(path: string): Promise<Buffer> {
    return createHash('sha256').update(await fs.readFile(path)).digest();
}

export type ReconcileResult = {
    hashes: Map<string, Buffer>,      // current content hash for every extant path
    updated: Map<string, FileStat>,   // cache entries that changed (to persist)
    missing: string[],                // paths that don't exist or aren't files
};

// Content hashes with a stat cache: only files whose (size, mtime_ns) changed
// since the recorded cache entry are rehashed. mtime_ns exceeds 2^53, hence
// bigint stats throughout. A small worker pool keeps the fs thread pool fed
// without holding thousands of files open at once.
export async function reconcileHashes(paths: Iterable<string>,
                                      cache: Map<string, FileStat>): Promise<ReconcileResult> {
    let queue = [...paths];
    let hashes = new Map<string, Buffer>();
    let updated = new Map<string, FileStat>();
    let missing: string[] = [];
    let work = async () => {
        for (;;) {
            let path = queue.pop();
            if (path === undefined) {
                return;
            }
            let st;
            try {
                st = await fs.stat(path, {bigint: true});
            } catch {
                missing.push(path);
                continue;
            }
            if (!st.isFile()) {
                missing.push(path);
                continue;
            }
            let cached = cache.get(path);
            let hash;
            if (cached !== undefined && cached.size === st.size && cached.mtimeNs === st.mtimeNs) {
                hash = cached.hash;
            } else {
                hash = await hashFile(path);
                updated.set(path, {size: st.size, mtimeNs: st.mtimeNs, hash});
            }
            hashes.set(path, hash);
        }
    };
    await Promise.all(Array.from({length: 16}, work));
    return {hashes, updated, missing};
}
