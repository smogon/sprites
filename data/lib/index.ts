
import path from 'path';
import fs from 'fs';
import root from '@smogon/sprite-root/index.ts';

let libdir = path.join(root, 'data');

export type Id = string;

export type SpecieEntry = {
    type: 'specie',
    num: number,
    formeNum: number,
    base: string,
    forme: string,
    sid: string
};

export type ItemEntry = {
    type: 'item',
    sid: string,
    names: string[]
};

export type Entry = SpecieEntry | ItemEntry;

let objects: Record<Id, Entry> = {};
Object.assign(objects, JSON.parse(fs.readFileSync(path.join(libdir, 'species.json'), 'utf8')));
Object.assign(objects, JSON.parse(fs.readFileSync(path.join(libdir, 'items.json'), 'utf8')));

let map = new Map<Id, Entry>();
for (let entry of Object.values(objects)) {
    map.set(entry.sid, entry);
}

export function get(id: Id): Entry {
    let entry = map.get(id);
    if (entry === undefined)
        throw new Error(`No id for ${id}`);
    return entry;
}

export function entries(): Entry[] {
    return Array.from(map.values());
}


// TODO Moved here from deploy/spritename.ts, better place to put these??
export type SpriteFilename = ({
    extension: true,
    name: string
} | {
    extension: false,
    id: Id
}) & {
    extra: Map<string, string>
};

export type InputSpriteFilename = ({
    extension: true,
    name: string
} | {
    extension?: false,
    id: Id
}) & {
    extra?: Map<string, string>
};

export function parseFilename(s: string): SpriteFilename {
    if (s.length < 2)
        throw new Error(`Filename ${s} needs to be at least 2 characters'`);

    let prefix = s[0]!;
    if (!prefix.match(/[a-z]/))
        throw new Error(`Filename ${s} must start with alpha character`);

    let parts = s.split('-');
    let extra = new Map<string, string>();
    for (let part of parts.slice(1)) {
        if (part.length === 0)
            throw new Error(`Can't parse ${s}`);
        extra.set(part[0]!, part.slice(1));
    }
    
    if (prefix === 'x') {
        let name = parts[0]!.slice(1);
        return {extension: true, name, extra};
    } else {
        let id = parts[0]!;
        return {extension: false, id, extra};
    }
}

export function formatFilename(si: InputSpriteFilename) {
    let s: string;
    if (si.extension) {
        s = `x${si.name}`;
    } else {
        s = si.id;
    }
    let extra = [];
    if (si.extra) {
        for (let [k, v] of si.extra.entries()) {
            extra.push(`-${k}${v}`);
        }
    }
    extra.sort();
    s += extra.join('');
    return s;
}
