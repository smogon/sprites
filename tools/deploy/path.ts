
import pathlib from 'path';

type PathAttrs = {dir : string, name : string, ext : string | null};

export class Path {
    public readonly dir : string;
    public readonly name : string;
    public readonly ext : string | null;
    
    constructor({dir, name, ext} : PathAttrs) {
        this.dir = dir;
        this.name = name;
        this.ext = ext;
    }

    static parse(x : string) {
        const {dir, name, ext} = pathlib.parse(x);
        return new Path({dir, name, ext: ext === "" ? null : ext.slice(1)});
    }
    
    update({dir, name, ext} : Partial<PathAttrs>) {
        return new Path({dir: dir ?? this.dir,
                         name : name ?? this.name,
                         ext : ext === undefined ? this.ext : ext});
    }

    format() {
        return pathlib.format({dir : this.dir,
                               name : this.name,
                               ext : this.ext === null ? "" : `.${this.ext}`});
    }
}
