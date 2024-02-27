
function toSmogonAlias(name) {
    return name.toLowerCase().
        replace(/[ _]+/, "-").
        replace(/[^a-z0-9-]+/g, '');
}

function toPSID(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function spritecopy(f, {dir, ext}, allowUnknown=false) {
    const sn = spritedata.parseFilename(f.name);
    let name;

    // Skip asymmetrical for now
    if (sn.extra.has("a") || sn.extra.has("b") || sn.extra.has("s")) {
        return;
    }

    if (sn.extension) {
        if (allowUnknown && sn.extension && sn.name === "Unknown") {
            name = "unknown"
        } else {
            // Skip this, we don't use Unknown/Substitute
            return;
        }
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
    const sd = spritedata.get(sn.id);
    for (const n of sd.names) {
        const name = toSmogonAlias(n);
        copy(f, {dir, ext, name});
    }
}

function newspritecopy(f, {dir, ext}) {
    const sn = spritedata.parseFilename(f.name);
    if (sn.extension) {
        return
    }
    const sd = spritedata.get(sn.id);
    for (const n of sd.type === 'item' ? sd.names : [sd.base + sd.forme]) {
        let name = toPSID(n);
        if (sn.extra.has("f")) {
            name += "f";
        }
        if (sn.extra.has("g")) {
            name += "gmax";
        }
        copy(f, {dir, ext, name});
    }
}

let seenModels = new Set;

for (const f of list("src/models")) {
    seenModels.add(f.name);
    spritecopy(f, {dir: "xy"});
}

for (const f of list("build/gen9-modelslike")) {
    if (seenModels.has(f.name)) continue;
    seenModels.add(f.name);
    spritecopy(f, {dir: "xy"});
}

// Non-model CAPs
for (const f of list("src/sprites/gen5")) {
    if (f.ext !== 'gif' || seenModels.has(f.name)) continue;
    seenModels.add(f.name);
    spritecopy(f, {dir: "xy"});
}

for (const f of list("build/gen5-gif")) {
    if (seenModels.has(f.name)) continue;
    seenModels.add(f.name);
    spritecopy(f, {dir: "xy"});
}

for (const f of list("build/gen6-minisprites-trimmed")) {
    spritecopy(f, {dir: "xyicons"});
}

for (const f of list("build/item-minisprites-trimmed")) {
    itemspritecopy(f, {dir: "xyitems"});
}

let h = hash(...list("build/smogon/minisprites"));
for (const f of list("build/smogon/minisprites")) {
    newspritecopy(f, {dir: "minisprites/" + h});
}
write("minisprites/hash.txt", h);

for (const f of list("build/item-minisprites-padded")) {
    itemspritecopy(f, {dir: "forumsprites"});
}

for (const f of list("build/gen6-minisprites-padded")) {
    spritecopy(f, {dir: "forumsprites"}, true);
}

for (const f of list("build/smogon/fbsprites/xy")) {
    spritecopy(f, {dir: "fbsprites/xy"});
}

for (const f of list("build/smogon/twittersprites/xy")) {
    spritecopy(f, {dir: "twittersprites/xy"});
}

for (const f of list("src/pmd")) {
    seenModels.add(f.name);
    spritecopy(f, {dir: "pmd"});
}
