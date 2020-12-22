
function toSmogonAlias(name) {
    return name.toLowerCase().
        replace(/[ _]+/, "-").
        replace(/[^a-z0-9-]+/g, '');
}

function spritecopy(f, {dir, ext}) {
    const sn = spritedata.parseFilename(f.name);
    let name;

    // Skip asymmetrical for now
    if (sn.extra.has("a") || sn.extra.has("b") || sn.extra.has("s")) {
        return;
    }
    
    if (typeof sn.id === 'string') {
        // Skip this, we don't use Unknown/Substitute
        return;
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

// TODO: merge with above
function itemspritecopy(f, {dir, ext}) {
    const sn = spritedata.parseFilename(f.name);
    const sd = spritedata.getItem(sn.id);
    const name = toSmogonAlias(sd.name);
    copy(f, {dir, ext, name});
}

for (const f of list("newsrc/models")) {
    spritecopy(f, {dir: "xy"});
}

for (const f of list("build/gen6-minisprites-trimmed")) {
    spritecopy(f, {dir: "xyicons"});
}

for (const f of list("build/item-minisprites-trimmed")) {
    itemspritecopy(f, {dir: "xyitems"});
}

for (const f of list("build/item-minisprites-padded")) {
    itemspritecopy(f, {dir: "forumsprites"});
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
