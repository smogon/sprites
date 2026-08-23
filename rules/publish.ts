
import * as spritedata from '@smogon/sprite-data/index.ts';

import type {Artifact} from '../tools/build/artifact.ts';
import type {DeployCtx, SrcFile} from '../tools/deploy/api.ts';

// Anything with a sprite-id nominal name and an extension: a built artifact
// or a raw source file.
export type Sprite = Artifact | SrcFile;

// The unhashed name -> served url mapping published beside a stamped set.
// `base` is the url this deploy's tree is served at, so an entry is just that
// plus the copy's destination and no consumer needs a prefix of its own. The
// rsync sets don't know their url yet and pass none, keeping the older
// `name.ext` -> stamped filename shape.
export class Manifest {
    #ctx: DeployCtx;
    #base: string | null;
    #entries = new Map<string, string>();

    constructor(ctx: DeployCtx, base: string | null = null) {
        this.#ctx = ctx;
        this.#base = base;
    }

    // Queue a copy of `f` under `dir` with a content-stamped name and record
    // the entry that points at it.
    async copy(f: Sprite, {dir, ext}: Dest, name: string): Promise<void> {
        let h = await this.#ctx.hash(f);
        let e = extOf(f, ext);
        let stamped = `${name}-${h}.${e}`;
        let dst = `${dir}/${stamped}`;
        // A url names the whole path, so its key has nothing to disambiguate
        // with an extension.
        let key = this.#base === null ? `${name}.${e}` : name;
        // ActionQueue only dedups final dsts; hashed dsts differ even when
        // unhashed names collide, so check the key explicitly.
        if (this.#entries.has(key)) {
            throw new Error(`duplicate sprite name ${key}`);
        }
        this.#entries.set(key, this.#base === null ? stamped : `${this.#base}/${dst}`);
        this.#ctx.copy(f, dst);
    }

    write(dst: string): void {
        let sorted: Record<string, string> = {};
        for (let [k, v] of [...this.#entries].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
            sorted[k] = v;
        }
        this.#ctx.write(dst, JSON.stringify(sorted, null, 4) + '\n');
    }
}

export type Dest = {
    dir: string,
    ext?: string,
};

function extOf(f: Sprite, ext?: string): string {
    let result = ext ?? f.ext;
    if (result === null) {
        throw new Error(`Sprite ${f.name} has no extension`);
    }
    return result;
}

// The names a sprite publishes under on the smogon side, or none where it
// isn't published at all. A set that backfills another needs this before it
// copies, since the mapping isn't one name per filename in either direction:
// Meowstic answers to two, and the forme slots the games gave one sprite (the
// six Minior meteors, Zygarde's Power Construct pair) answer to the same one.
export type NameOpts = {
    // forumsprites publishes Unknown; no other set does.
    allowUnknown?: boolean,
    // The gen 6 icon sets publish the formes they have no icon for under a
    // borrowed one. See ICON_ALIASES.
    icons?: boolean,
};

export function publishedNames(f: Sprite, opts: NameOpts = {}): string[] {
    let sn = spritedata.parseFilename(f.name);

    // Skip asymmetrical for now
    if (sn.extra.has('a') || sn.extra.has('b') || sn.extra.has('s')) {
        return [];
    }

    if (sn.kind === 'x') {
        // Skip these, we don't use Unknown/Substitute
        if (!opts.allowUnknown || sn.name !== 'unknown') {
            return [];
        }
    } else if (sn.kind !== 's') {
        throw new Error(`Not a specie sprite: ${f.name}`);
    }

    return opts.icons ? spritedata.iconNames(sn) : spritedata.smogonNames(sn);
}

export async function spritecopy(manifest: Manifest, f: Sprite, dest: Dest,
                                 opts: NameOpts = {}): Promise<void> {
    for (let name of publishedNames(f, opts)) {
        await manifest.copy(f, dest, name);
    }
}

// TODO: merge with above
export async function itemspritecopy(manifest: Manifest, f: Sprite, dest: Dest): Promise<void> {
    let sn = spritedata.parseFilename(f.name);
    if (sn.kind !== 'i') {
        throw new Error(`Not an item sprite: ${f.name}`);
    }
    await manifest.copy(f, dest, spritedata.smogon(sn.name));
    for (let alias of spritedata.ITEM_ALIASES[sn.name] ?? []) {
        await manifest.copy(f, dest, spritedata.smogon(alias));
    }
}
