
export type SpriteName = {id : number | string, extra : Map<string, string>};

export function parse(s : string) : SpriteName {
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

export function format(si : SpriteName) {
    let s = si.id.toString();
    const extra = [];
    for (const [k, v] of si.extra.entries()) {
        extra.push(`-${k}${v}`);
    }
    extra.sort();
    return s + extra.join('');
}
