
import * as spritedata from '@smogon/sprite-data/index.ts';

import type {Artifact} from '../tools/build/artifact.ts';
import type {DeployCtx, SrcFile} from '../tools/deploy/api.ts';

// Anything with a sprite-id nominal name and an extension: a built artifact
// or a raw source file.
export type Sprite = Artifact | SrcFile;

// The unhashed -> hashed name mapping published beside a stamped set.
export class Manifest {
    readonly ctx : DeployCtx;
    private entries = new Map<string, string>();

    constructor(ctx : DeployCtx) {
        this.ctx = ctx;
    }

    set(key : string, value : string) : void {
        // ActionQueue only dedups final dsts; hashed dsts differ even when
        // unhashed names collide, so check the key explicitly.
        if (this.entries.has(key)) {
            throw new Error(`duplicate sprite name ${key}`);
        }
        this.entries.set(key, value);
    }

    write(dst : string) : void {
        const sorted : Record<string, string> = {};
        for (const k of [...this.entries.keys()].sort()) {
            sorted[k] = this.entries.get(k)!;
        }
        this.ctx.write(dst, JSON.stringify(sorted, null, 4) + "\n");
    }
}

export interface Dest {
    dir : string;
    ext? : string;
}

function extOf(f : Sprite, ext? : string) : string {
    const result = ext ?? f.ext;
    if (result === null) {
        throw new Error(`Sprite ${f.name} has no extension`);
    }
    return result;
}

export function toSmogonAlias(name : string) : string {
    return name.toLowerCase().
        replace(/[ _]+/, "-").
        replace(/[^a-z0-9-]+/g, '');
}

export function toPSID(name : string) : string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Copy with a content-hash-stamped name and record the unhashed -> hashed
// mapping in `manifest`.
export function stampcopy(manifest : Manifest, f : Sprite, {dir, ext}: Dest, name : string) : void {
    const h = manifest.ctx.hash(f);
    manifest.set(`${name}.${extOf(f, ext)}`, `${name}-${h}.${extOf(f, ext)}`);
    manifest.ctx.copy(f, `${dir}/${name}-${h}.${extOf(f, ext)}`);
}

export function spritecopy(manifest : Manifest, f : Sprite, dest : Dest,
                           allowUnknown = false) : void {
    const sn = spritedata.parseFilename(f.name);
    let name : string;

    // Skip asymmetrical for now
    if (sn.extra.has("a") || sn.extra.has("b") || sn.extra.has("s")) {
        return;
    }

    if (sn.extension) {
        if (allowUnknown && sn.name === "Unknown") {
            name = "unknown";
        } else {
            // Skip this, we don't use Unknown/Substitute
            return;
        }
    } else {
        const sd = spritedata.get(sn.id);
        if (sd.type !== 'specie') {
            throw new Error(`Not a specie sprite: ${f.name}`);
        }
        name = toSmogonAlias(sd.base);
        if (sd.forme) {
            name += `-${toSmogonAlias(sd.forme)}`;
        }
    }
    if (sn.extra.has("f")) {
        name += "-f";
    }
    if (sn.extra.has("g")) {
        name += "-gmax";
    }

    stampcopy(manifest, f, dest, name);
}

// TODO: merge with above
export function itemspritecopy(manifest : Manifest, f : Sprite, dest : Dest) : void {
    const sn = spritedata.parseFilename(f.name);
    if (sn.extension) {
        throw new Error(`Not an item sprite: ${f.name}`);
    }
    const sd = spritedata.get(sn.id);
    if (sd.type !== 'item') {
        throw new Error(`Not an item sprite: ${f.name}`);
    }
    for (const n of sd.names) {
        stampcopy(manifest, f, dest, toSmogonAlias(n));
    }
}

export function newspritecopy(ctx : DeployCtx, f : Sprite, dest : Dest) : void {
    const sn = spritedata.parseFilename(f.name);
    if (sn.extension) {
        return;
    }
    const sd = spritedata.get(sn.id);
    for (const n of sd.type === 'item' ? sd.names : [sd.base + sd.forme]) {
        let name = toPSID(n);
        if (sn.extra.has("f")) {
            name += "f";
        }
        if (sn.extra.has("g")) {
            name += "gmax";
        }
        ctx.copy(f, `${dest.dir}/${name}.${extOf(f, dest.ext)}`);
    }
}
