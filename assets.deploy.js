
// The upload contract wants __key first in the tar, naming the asset set;
// the tar packer emits ops in queue order, so it has to be the first op.
write("__key", "sprites");

function toSmogonAlias(name) {
    return name.toLowerCase().
        replace(/[ _]+/, "-").
        replace(/[^a-z0-9-]+/g, '');
}

function toPSID(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Copy with a content-hash-stamped name and record the unhashed -> hashed
// mapping in `manifest`.
function stampcopy(f, {dir, ext, name}, manifest) {
    const key = `${name}.${ext ?? f.ext}`;
    // ActionQueue only dedups final dsts; hashed dsts differ even when
    // unhashed names collide, so check the manifest key explicitly.
    if (manifest[key] !== undefined) {
        throw new Error(`duplicate sprite name ${key}`);
    }
    const h = hash(f);
    manifest[key] = `${name}-${h}.${ext ?? f.ext}`;
    copy(f, {dir, ext, name: `${name}-${h}`});
}

function writeManifest(dst, manifest) {
    const sorted = {};
    for (const k of Object.keys(manifest).sort()) {
        sorted[k] = manifest[k];
    }
    write(dst, JSON.stringify(sorted, null, 4) + "\n");
}

function spritecopy(f, {dir, ext}, allowUnknown=false, manifest=null) {
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

    if (manifest) {
        stampcopy(f, {dir, ext, name}, manifest);
    } else {
        copy(f, {dir, ext, name});
    }
}

// TODO: merge with above
function itemspritecopy(f, {dir, ext}, manifest=null) {
    const sn = spritedata.parseFilename(f.name);
    const sd = spritedata.get(sn.id);
    for (const n of sd.names) {
        const name = toSmogonAlias(n);
        if (manifest) {
            stampcopy(f, {dir, ext, name}, manifest);
        } else {
            copy(f, {dir, ext, name});
        }
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

// Dex spritesheet assets: hash-stamped css + webp. The css suffix pointer
// rides in __meta/ for the dex to read.
{
    const wh = hash("build/smogon/spritesheet.webp");
    copy("build/smogon/spritesheet.webp", `spritesheet-${wh}.webp`);
    const src = read("build/smogon/spritesheet.css");
    const css = src.replaceAll('url("./spritesheet.webp")', `url("./spritesheet-${wh}.webp")`);
    if (css === src) {
        throw new Error("spritesheet.css: no webp urls rewritten");
    }
    // Suffix from source content: the rewritten css is a pure function of
    // (css, webp), so this changes exactly when the served bytes change.
    const ch = hash("build/smogon/spritesheet.css", "build/smogon/spritesheet.webp");
    write(`spritesheet-${ch}.css`, css);
    write("__meta/spritesheet_css_suffix.txt", `-${ch}\n`);
}

{
    const h = hash(...list("build/smogon/minisprites"));
    for (const f of list("build/smogon/minisprites")) {
        newspritecopy(f, {dir: "minisprites/" + h});
    }
    write("__meta/minisprites-hash.txt", h);
}

{
    const manifest = {};
    for (const f of list("build/item-minisprites-padded")) {
        itemspritecopy(f, {dir: "forumsprites"}, manifest);
    }
    for (const f of list("build/gen6-minisprites-padded")) {
        spritecopy(f, {dir: "forumsprites"}, true, manifest);
    }
    writeManifest("__meta/forumsprites/manifest.json", manifest);
}

{
    const manifest = {};
    for (const f of list("src/pmd")) {
        spritecopy(f, {dir: "pmd"}, false, manifest);
    }
    writeManifest("__meta/pmd/manifest.json", manifest);
}
