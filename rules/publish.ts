
import * as spritedata from '@smogon/sprite-data/index.ts';

import type {Artifact} from '../tools/build/artifact.ts';
import type {DeployCtx, SrcFile} from '../tools/deploy/api.ts';

// Anything with a sprite-id nominal name and an extension: a built artifact
// or a raw source file.
export type Sprite = Artifact | SrcFile;

// The published tree a stamped set goes into: where it sits in the output, and
// the url that root is served at. Both live here rather than in a `dir` so
// that they are written once and everything a set publishes -- the copies, the
// urls, the mirror -- is spelled from the same place.
export type Tree = {
    root: string,
    served: string,
};

// One copy this manifest made: where under the tree root it landed, and the
// un-stamped filename it answers to.
type Entry = {
    dir: string,
    stamped: string,
    filename: string,
};

// The unhashed name -> served url mapping published beside a stamped set. An
// entry is the tree's url plus the copy's place in it, so no consumer needs a
// prefix of its own.
export class Manifest {
    #ctx: DeployCtx;
    #tree: Tree;
    #entries = new Map<string, Entry>();

    constructor(ctx: DeployCtx, tree: Tree) {
        this.#ctx = ctx;
        this.#tree = tree;
    }

    // Queue a copy of `f` under `dir` with a content-stamped name and record
    // the entry that points at it.
    async copy(f: Sprite, {dir, ext}: Dest, name: string): Promise<void> {
        let h = await this.#ctx.hash(f);
        let e = extOf(f, ext);
        // Keyed on the name alone, since a url names the whole path and has
        // nothing to disambiguate with an extension. ActionQueue only dedups
        // final dsts, and hashed dsts differ even where unhashed names
        // collide, so the collision is caught here or not at all.
        if (this.#entries.has(name)) {
            throw new Error(`duplicate sprite name ${name}`);
        }
        let stamped = `${name}-${h}.${e}`;
        this.#entries.set(name, {dir, stamped, filename: `${name}.${e}`});
        this.#ctx.copy(f, `${this.#tree.root}/${dir}/${stamped}`);
    }

    write(dst: string): void {
        let sorted: Record<string, string> = {};
        for (let [k, e] of this.#sorted()) {
            sorted[k] = `${this.#tree.served}/${e.dir}/${e.stamped}`;
        }
        this.#ctx.write(dst, JSON.stringify(sorted, null, 4) + '\n');
    }

    // The same set again under its un-stamped names, as links to the stamped
    // files. `dst` is a root of its own rather than the tree's, so what a link
    // says is a path and not a name: the two ends land apart, and the reader
    // that follows one composed its half from nothing but the sprite. The
    // tree's own root is not repeated under it, since the mirror is already
    // one set's worth of it.
    links(dst: string): void {
        for (let [, e] of this.#sorted()) {
            this.#ctx.symlink(`${dst}/${e.dir}/${e.filename}`,
                              `${this.#tree.root}/${e.dir}/${e.stamped}`);
        }
    }

    #sorted(): [string, Entry][] {
        return [...this.#entries].sort((a, b) => a[0] < b[0] ? -1 : 1);
    }
}

export type Dest = {
    // Under the tree root, not from the output root.
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
