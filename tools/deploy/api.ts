
import crypto from 'crypto';
import fs from 'fs';

import b32encode from 'base32-encode';

import {Artifact} from '../build/artifact.ts';
import {casPath} from '../build/cas.ts';
import {type ActionQueue} from './queue.ts';
import * as pathlib from './path.ts';

// A source-tree file from ctx.list(); shaped like a deploy Path plus the
// repo-relative path.
export interface SrcFile extends pathlib.Path {
    path : string;
}

export type CopySource = Artifact | SrcFile | string;   // string = repo-relative path

// The finish API: nice naming over built artifacts and raw sources. Ops are
// queued in call order, which is the tar entry order.
export interface DeployCtx {
    copy(src : CopySource, dst : string) : void;
    write(dst : string, data : string) : void;
    read(src : CopySource) : string;
    list(dir : string) : SrcFile[];
    // 8-char base32 content stamp. One source: the digest of its bytes,
    // byte-compatible with artifact hashes. Several: a digest of the sorted
    // per-source digests (order-insensitive).
    hash(...srcs : CopySource[]) : string;
}

export type DeployFn = (ctx : DeployCtx) => void | Promise<void>;

// Like rule(): a buildFile registers free-floating deploy blocks next to the
// rules they ship. They run in registration order after the build, sharing
// one ctx (and so one output tree) per buildFile.
const deploys : DeployFn[] = [];

export function deploy(fn : DeployFn) : void {
    deploys.push(fn);
}

export function getDeploys() : readonly DeployFn[] {
    return deploys;
}

export function resetDeploys() : void {
    deploys.length = 0;
}

function shortHash(digest : Buffer) : string {
    return b32encode(digest, 'RFC4648').slice(0, 8);
}

export function makeCtx(casDir : string, queue : ActionQueue) : DeployCtx {
    // Every path here is repo-root-relative; the CLI chdirs to the root.
    const srcPath = (src : CopySource) : string => {
        if (src instanceof Artifact) {
            return casPath(casDir, src.hash, src.ext);
        }
        return typeof src === 'string' ? src : src.path;
    };
    const digestOf = (src : CopySource) : Buffer => {
        if (src instanceof Artifact) {
            return Buffer.from(src.hash, 'hex');
        }
        return crypto.createHash('sha256').update(fs.readFileSync(srcPath(src))).digest();
    };
    return {
        copy(src : CopySource, dst : string) : void {
            queue.copy(srcPath(src), dst);
        },
        write(dst : string, data : string) : void {
            queue.write(data, dst);
        },
        read(src : CopySource) : string {
            return fs.readFileSync(srcPath(src), 'utf8');
        },
        list(dir : string) : SrcFile[] {
            const result = [];
            // Files only, no dotfiles: the same filtering the build-side
            // glob applies to rule inputs.
            for (const ent of fs.readdirSync(dir, {withFileTypes: true}).sort((a, b) => a.name < b.name ? -1 : 1)) {
                if (ent.name.startsWith('.') || (!ent.isFile() && !ent.isSymbolicLink())) {
                    continue;
                }
                const p = pathlib.path(ent.name, {dir});
                result.push({...p, path: pathlib.format(p)});
            }
            return result;
        },
        hash(...srcs : CopySource[]) : string {
            if (srcs.length === 1) {
                return shortHash(digestOf(srcs[0]!));
            }
            const digests = srcs.map(digestOf).sort(Buffer.compare);
            const h = crypto.createHash('sha256');
            for (const d of digests) {
                h.update(d);
            }
            return shortHash(h.digest());
        },
    };
}
