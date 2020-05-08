
import pathlib from 'path';

export function decodeComponent(s) {
    return s
        .replace(/([^_])_([^_])/g, "$1 $2")
        .replace(/~/g, "-")
        // Must occur last, or escaped ~/_ will be transformed
        .replace(/__(....)/g, (_, m) => String.fromCharCode(parseInt(m, 16)));
}

export function decode(s) {
    return s.split("-").map(c => decodeComponent(c));
}

export function parse(s) {
    const {dir, root, name, ext} = pathlib.parse(s);
    return {
        dir,
        root,
        data: decode(name),
        ext
    };
}

export function encodeComponent(s) {
    return s
        .replace(/[^0-9a-zA-Z-. ]/g, c => '__' + c.charCodeAt(0).toString(16).padStart(4, "0"))
        .replace(" ", "_")
        .replace("-", "~");
}

export function encode(l) {
    return l.map(c => encodeComponent(c)).join("-");
}

export function format({dir, root, data, ext}) {
    return pathlib.format({
        dir,
        root,
        name: encode(data),
        ext
    });
}

export function parsePokemonFilename([num, formeNum, base, forme=null]) {
    return {num: parseInt(num, 10), formeNum: parseInt(formeNum, 10), base, forme};
}

export function toPSID(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function toPSSpriteID(data) {
    const info = parsePokemonFilename(data);
    let result = toPSID(info.base);
    if (info.forme !== null) {
        if (info.forme === 'Female') {
            info.forme = 'F';
        }
        result += '-' + toPSID(info.forme);
    }
    return result;
}

export function toSmogonAlias(name) {
    return name.toLowerCase().
        replace(/[ _]+/, "-").
        replace(/[^a-z0-9-]+/g, '');
}

export function toSmogonSpriteAlias(data) {
    const info = parsePokemonFilename(data);
    let result = toSmogonAlias(info.base);
    if (info.forme !== null) {
        result += '-' + toSmogonAlias(info.forme);
    }
    return result;
}
