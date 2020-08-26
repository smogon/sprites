
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const libdir = path.join(__dirname, "../..");

export type Type = {
    num: number,
    formeNum: number,
    base: string,
    forme: string,
    sid: number
};

const species : Record<number, Type> = JSON.parse(fs.readFileSync(path.join(libdir, "species.json"), 'utf8'));

const result = new Map<number, Type>();

for (const entry of Object.values(species)) {
    result.set(entry.sid, entry);
}

export function get(id : number) : Type {
    const entry = result.get(id);
    if (entry === undefined)
        throw new Error(`No id for ${id}`);
    return entry;
}

export function entries() : [number, Type][] {
    return Array.from(result.entries());
}

// TODO Moved here from deploy/spritename.ts, better place to put these??
export type SpriteFilename = {id : number | string, extra : Map<string, string>};

export function parseFilename(s : string) : SpriteFilename {
    const parts = s.split("-");
    const id = parts[0].match(/^[0-9]+$/) ? parseInt(parts[0], 10) : parts[0];
    const extra = new Map<string, string>();
    for (const part of parts.slice(1)) {
        if (part.length === 0)
            throw new Error(`Can't parse ${s}`);
        extra.set(part[0], part.slice(1));
    }
    return {id, extra};
}

export function formatFilename(si : SpriteFilename) {
    let s = si.id.toString();
    const extra = [];
    for (const [k, v] of si.extra.entries()) {
        extra.push(`-${k}${v}`);
    }
    extra.sort();
    return s + extra.join('');
}
