
function toSmogonAlias(name) {
    return name.toLowerCase().
        replace(/[ _]+/, "-").
        replace(/[^a-z0-9-]+/g, '');
}

function spritecopy(f, {dir, ext}) {
    const sn = spritename.parse(f.name);
    let name;

    // Skip asymmetrical for now
    if (sn.extra.has("a")) {
        return;
    }
    
    if (typeof sn.id === 'string') {
        name = toSmogonAlias(sn.id);
    } else {
        const sd = spritedata.get(sn.id);
        name = toSmogonAlias(sd.base);
        if (sd.forme) {
            name += `-${toSmogonAlias(sd.forme)}`;
        }
    }
    if (sn.extra.has("f")) {
        name += "-f";
    }
    if (sn.extra.has("g")) {
        name += "-gmax";
    }
    
    copy(f, {dir, ext, name});
}

for (const f of list("build/gen6-minisprites-padded")) {
    spritecopy(f, {dir: "forumsprites"});
}

for (const f of list("build/smogon/fbsprites/xy")) {
    spritecopy(f, {dir: "fbsprites/xy"});
}

for (const f of list("build/smogon/twittersprites/xy")) {
    spritecopy(f, {dir: "twittersprites/xy"});
}
