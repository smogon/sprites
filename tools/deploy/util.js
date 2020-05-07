
export function decode(s) {
    return s.replace(/__(....)/g, (_, m) => String.fromCharCode(parseInt(m, 16))).replace("_", " ");
}

export function decomposeName(name) {
    const [num, formeNum, base, forme=null] = name.split("--");
    return {num: parseInt(num, 10), formeNum: parseInt(formeNum, 10), base, forme};
}

export function toPSID(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function toPSSpriteID(name) {
    const info = decomposeName(name);
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
        replace("--", "-").
        replace(/[ _]+/, "-").
        replace(/[^a-z0-9-]+/g, '');
}

export function toSmogonSpriteAlias(name) {
    const info = decomposeName(name);
    let result = toSmogonAlias(info.base);
    if (info.forme !== null) {
        result += '-' + toSmogonAlias(info.forme);
    }
    return result;
}
