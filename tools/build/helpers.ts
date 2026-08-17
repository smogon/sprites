
import fs from 'fs';
import pathlib from 'path';

import type {Artifact} from './artifact.ts';
import {type Cmd, basenameNoExt} from './subst.ts';

let config = new Map<string, string>();

export function setConfig(cfg : Map<string, string>) : void {
    config = cfg;
}

export function getconfig(name : string) : string | undefined {
    const value = config.get(name);
    return value === '' ? undefined : value;
}

export function astable(x : string | string[] | undefined) : string[] {
    if (x === undefined) {
        return [];
    }
    return typeof x === 'string' ? [x] : x;
}

// Single-directory, single-'*' glob (all Tupfile patterns were of this form).
// Non-glob strings pass through literally; existence is checked at hash time.
// Results are sorted within a pattern; declared order is preserved across
// patterns (some rules, e.g. the pokeball sheet, are input-order-sensitive).
function globOne(pat : string) : string[] {
    if (!pat.includes('*')) {
        return [pat];
    }
    const dir = pathlib.dirname(pat);
    const base = pathlib.basename(pat);
    if (dir.includes('*') || base.indexOf('*') !== base.lastIndexOf('*')) {
        throw new Error(`Unsupported glob pattern: ${pat}`);
    }
    const [prefix, suffix] = base.split('*') as [string, string];
    const results = [];
    for (const ent of fs.readdirSync(dir, {withFileTypes: true})) {
        if (!ent.isFile() && !ent.isSymbolicLink()) {
            continue;
        }
        const name = ent.name;
        if (name.startsWith('.')) {
            continue;  // tup.glob ignored dotfiles
        }
        if (name.length >= prefix.length + suffix.length
            && name.startsWith(prefix) && name.endsWith(suffix)) {
            results.push(dir === '.' ? name : `${dir}/${name}`);
        }
    }
    results.sort();
    return results;
}

export function glob(pats : string | string[]) : string[] {
    return astable(pats).flatMap(globOne);
}

// tup.base: basename without directory or final extension. For an artifact,
// its nominal name.
export function base(x : string | Artifact) : string {
    return typeof x === 'string' ? basenameNoExt(x) : x.name;
}

export interface SpriteData {
    id : string;
    data : Record<string, string | true>;
}

// Port of util/sprites.lua spritedata. Lua used gmatch("[^-]+"), which skips
// empty segments, hence the filter.
export function spritedata(basename : string) : SpriteData {
    const parts = basename.split('-').filter(p => p !== '');
    const data : Record<string, string | true> = {};
    for (const part of parts.slice(1)) {
        if (part.length === 1) {
            data[part] = true;
        } else {
            data[part[0]!] = part.slice(1);
        }
    }
    return {id: parts[0] ?? '', data};
}

export function spriteglob(pats : string | string[], flagspec? : Record<string, unknown>) : string[] {
    return glob(pats).filter(filename => {
        const sd = spritedata(base(filename));
        for (const [k, v] of Object.entries(flagspec ?? {})) {
            if (Boolean(v) !== Boolean(sd.data[k])) {
                return false;
            }
        }
        return true;
    });
}

// PNG date/time tEXt chunks make magick output nondeterministic, which would
// churn every content-addressed name on a rebuild.
export const PNG_DETERMINISTIC = '-define png:exclude-chunks=date,time';

export function pad(opts : {w : number, h : number, input? : string, output? : string}) : string {
    const input = opts.input ?? '%f';
    const output = opts.output ?? '%o';
    return `magick convert ${input} ${PNG_DETERMINISTIC} -background transparent -gravity center -extent ${opts.w}x${opts.h} ${output}`;
}

export function trimimg(opts : {input? : string, output? : string} = {}) : string {
    return `magick convert ${opts.input ?? '%f'} ${PNG_DETERMINISTIC} -trim ${opts.output ?? '%o'}`;
}

interface CompressOpts {
    pngquant? : string;
    optipng? : string;
    advpng? : string;
}

function compressopts(program : string, copts : CompressOpts) : void {
    copts.pngquant = getconfig(`${program}_PNGQUANT`) ?? copts.pngquant;
    copts.optipng = getconfig(`${program}_OPTIPNG`) ?? copts.optipng;
    copts.advpng = getconfig(`${program}_ADVPNG`) ?? copts.advpng;
}

export function compresspng(opts : {config? : string, output? : string} = {}) : Cmd[] {
    const output = opts.output ?? '%o';
    const copts : CompressOpts = {};
    compressopts('DEFAULT', copts);
    if (opts.config) {
        compressopts(opts.config, copts);
    }
    const cmds = [];
    if (copts.pngquant !== undefined) {
        // -f -o necessary to overwrite existing file
        cmds.push(`pngquant -f -o ${output} ${copts.pngquant} ${output}`);
    }
    if (copts.optipng !== undefined) {
        cmds.push(`optipng -q ${copts.optipng} ${output}`);
    }
    if (copts.advpng !== undefined) {
        cmds.push(`advpng -q ${copts.advpng} ${output}`);
    }
    return cmds;
}
