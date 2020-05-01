
transform(toPSSpriteID, () => {
    dest("ani");
    sel(
        "src/canonical/models/front",
        "src/canonical/models/front-cosmetic",
        "src/canonical/models/front-misc",
        "src/noncanonical/models/front",
        "src/noncanonical/sprites/gen5/front"
    );
    
    dest("ani-back");
    sel(
        "src/canonical/models/back",
        "src/canonical/models/back-cosmetic",
        "src/canonical/models/back-misc",
        "src/noncanonical/models/back",
        "src/noncanonical/sprites/gen5/back"
    );
    
    dest("ani-shiny");
    sel(
        "src/canonical/models/back",
        "src/canonical/models/back-cosmetic",
    );
    
    dest("ani-back-shiny");
    sel(
        "src/canonical/models/back-shiny",
        "src/canonical/models/back-shiny-cosmetic",
    );

    dest("afd");
    sel(
        "src/noncanonical/sprites/afd/front",
        "src/noncanonical/sprites/afd/front-cosmetic",
    )

    dest("afd-shiny");
    sel(
        "src/noncanonical/sprites/afd/front-shiny",
        "src/noncanonical/sprites/afd/front-shiny-cosmetic",
    )

    dest("afd-back");
    sel(
        "src/noncanonical/sprites/afd/back",
        "src/noncanonical/sprites/afd/back-cosmetic",
    )

    dest("afd-back-shiny");
    sel(
        "src/noncanonical/sprites/afd/back-shiny",
        "src/noncanonical/sprites/afd/back-shiny-cosmetic",
    );

    dest("dex");
    sel(
        "build/padded-dex/canonical/front",
        "build/padded-dex/canonical/front-cosmetic",
    );

    dest("dex-shiny");
    sel(
        "build/padded-dex/canonical/front-shiny",
        "build/padded-dex/canonical/front-shiny-cosmetic",
    );
});

dest("trainers");
sel("build/padded-trainers/canonical");

function fixTypes(dst) {
    return dst.replace("Unknown", "???");
}

dest("types");
transform(fixTypes, () => {
    sel(
        "src/canonical/ui/types/gen4",
        "src/noncanonical/ui/types/gen4"
    );
});
