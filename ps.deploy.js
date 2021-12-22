
function toID(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function spritecopy(f, {dir, ext}) {
    const sn = spritedata.parseFilename(f.name);
    let name;
    if (sn.extension) {
        name = toID(sn.name);
    } else {
        const sd = spritedata.get(sn.id);
        debug(sd);
        name = toID(sd.base);
        if (sd.forme) {
            name += `-${toID(sd.forme)}`;
        }
    }
    if (sn.extra.has("f")) {
        name += "-f";
    }
    if (sn.extra.has("g")) {
        name += "-gmax";
    }
    if (sn.extra.has("b")) {
        dir += "-back";
    }
    if (sn.extra.has("s")) {
        dir += "-shiny";
    }
    copy(f, {dir, ext, name});
}

for (const f of list("src/models")) {
    spritecopy(f, {dir: "ani"});
}

for (const f of list("src/sprites/gen5")) {
    spritecopy(f, {dir: "gen5ani"});
}

for (const f of list("src/afd")) {
    spritecopy(f, {dir: "afd"});
}

for (const f of list("build/padded-dex")) {
    spritecopy(f, {dir: "dex"});
}

function fixType(name) {
    return name.replace("Unknown", "???");
}

for (const f of list("src/canonical/ui/types/gen4").concat(list("src/noncanonical/ui/types/gen4"))) {
    copy(f, {dir: "types", name: fixType(f.name)});
}

for (const f of list("src/canonical/ui/categories/gen4")) {
    copy(f, {dir: "categories"});
}
copy("src/noncanonical/ui/categories/undefined.png", {dir: "categories"});

copy("src/canonical/ui/battle/Alpha.png", {dir: "misc"});
copy("src/canonical/ui/battle/Mega.png", {dir: "misc"});
copy("src/canonical/ui/battle/Omega.png", {dir: "misc"});
        
// TODO: reenable when trainers are moved
// dest("trainers");
// sel("build/padded-trainers/canonical");

copy("build/ps/pokemonicons-pokeball-sheet.png", {dir: "."});
copy("build/ps/pokemonicons-sheet.png", {dir: "."});
//copy("build/ps/trainers-sheet.png", {dir: "."});
copy("build/ps/itemicons-sheet.png", {dir: "."});
