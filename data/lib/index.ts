
import path from 'path';
import fs from 'fs';
import root from '@smogon/sprite-root';

const libdir = path.join(root, "data");

export type Id = string;

export type SpecieEntry = {
    type : 'specie',
    num: number,
    formeNum: number,
    base: string,
    forme: string,
    sid: string
};

export type ItemEntry = {
    type : 'item',
    sid : string,
    names : string[]
};

export type Entry = SpecieEntry | ItemEntry;

const objects : Record<Id, Entry> = {};
Object.assign(objects, JSON.parse(fs.readFileSync(path.join(libdir, "species.json"), 'utf8')));
Object.assign(objects, JSON.parse(fs.readFileSync(path.join(libdir, "items.json"), 'utf8')));

const map = new Map<Id, Entry>();
for (const entry of Object.values(objects)) {
    map.set(entry.sid, entry);
}

export function get(id : Id) : Entry {
    const entry = map.get(id);
    if (entry === undefined)
        throw new Error(`No id for ${id}`);
    return entry;
}

export function entries() : Entry[] {
    return Array.from(map.values());
}


// TODO Moved here from deploy/spritename.ts, better place to put these??
export type SpriteFilename = ({
    extension : true,
    name : string
} | {
    extension : false,
    id : Id
}) & {
    extra : Map<string, string>
};

export type InputSpriteFilename = ({
    extension : true,
    name : string
} | {
    extension? : false,
    id : Id
}) & {
    extra? : Map<string, string>
};

export function parseFilename(s : string) : SpriteFilename {
    if (s.length < 2)
        throw new Error(`Filename ${s} needs to be at least 2 characters'`);

    const prefix = s[0];
    if (!prefix.match(/[a-z]/))
        throw new Error(`Filename ${s} must start with alpha character`);

    const parts = s.split("-");
    const extra = new Map<string, string>();
    for (const part of parts.slice(1)) {
        if (part.length === 0)
            throw new Error(`Can't parse ${s}`);
        extra.set(part[0], part.slice(1));
    }
    
    if (prefix === 'x') {
        const name = parts[0].slice(1);
        return {extension: true, name, extra};
    } else {
        const id = parts[0];
        return {extension: false, id, extra};
    }
}

export function formatFilename(si : InputSpriteFilename) {
    let s : string;
    if (si.extension) {
        s = `x${si.name}`;
    } else {
        s = si.id;
    }
    const extra = [];
    if (si.extra) {
        for (const [k, v] of si.extra.entries()) {
            extra.push(`-${k}${v}`);
        }
    }
    extra.sort();
    s += extra.join('');
    return s;
}
