
export function decode(s) {
    return s.replace(/__(....)/g, (_, m) => String.fromCharCode(parseInt(m, 16))).replace("_", " ");
}

export function decomposeName(name) {
    const [base, forme=null] = name.split("--");
    return {base, forme};
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
