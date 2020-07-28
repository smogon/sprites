
import pathlib from 'path';

// Slight variation of pathlib parse, less fields, different ext handling
export type Path = {dir : string, name : string, ext : string | null};

export function parse(s : string) : Path {
    let {dir, name, ext: dotext} = pathlib.parse(s);
    let ext;
    if (dotext === "") {
        ext = null;
    } else {
        ext = dotext.slice(1);
    }
    return {dir, name, ext};
}

export function format({dir, name, ext} : Path) {
    const dotext = ext === null ? "" : `.${ext}`;
    return pathlib.format({dir, name, ext : dotext});
}

export function join(s : string, {dir, name, ext} : Path) : Path {
    return {dir: pathlib.join(s, dir), name, ext};
}

export type Delta = Partial<Path>;

export function update({dir, name, ext} : Path, delta : Delta) : Path {
    return {
        dir: delta.dir ?? dir,
        name: delta.name ?? name,
        ext: delta.ext === undefined ? ext : delta.ext
    };
}

// Convenience function

export type PathLike = Path | string;

export function path(p : PathLike, delta? : Delta) : Path {
    let parsed = typeof p === 'string' ? parse(p) : p;
    if (delta !== undefined)
        parsed = update(parsed, delta);
    return parsed;
}
