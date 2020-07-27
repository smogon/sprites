
import pathlib from 'path';

const toPathStringSym = Symbol('toPathStringSym');

export interface IPath {
    [toPathStringSym](): string;
}

export type PathLike = IPath | string;

class PathClass {
    constructor(public readonly dir : string,
                public readonly name : string,
                public readonly ext : string | null) {}
   
    [toPathStringSym]() {
        return pathlib.format({dir : this.dir,
                               name : this.name,
                               ext : this.ext === null ? "" : `.${this.ext}`});
    }
}

export type Path = PathClass;
export type PathDelta = {dir? : string, name? : string, ext? : string | null};

export function path(p : PathLike, delta : PathDelta = {}) : Path {
    const s = typeof p === 'string' ? p : p[toPathStringSym]();
    let {dir, name, ext: dotext} = pathlib.parse(s);
    let ext;
    if (dotext === "") {
        ext = null;
    } else {
        ext = dotext.slice(1);
    }
    dir = delta.dir ?? dir;
    name = delta.name ?? name;
    ext = delta.ext === undefined ? ext : delta.ext;
    return new PathClass(dir, name, ext);
}
