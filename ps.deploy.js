
transform(toPSSpriteID, () => {
    // dest("ani");
    // sel(
    //     "src/canonical/models/front",
    //     "src/canonical/models/front-cosmetic",
    // );
    // ignore(() => {
    //     sel(
    //         "src/cap/models/front",
    //         "src/cap/sprites/gen5/front",
    //     );
    // });
    
    // dest("ani-back");
    // sel(
    //     "src/canonical/models/back",
    //     "src/canonical/models/back-cosmetic",
    // );
    // ignore(() => {
    //     sel(
    //         "src/cap/models/back",
    //         "src/cap/sprites/gen5/back",
    //     );
    // });
    
    // dest("ani-shiny");
    // sel(
    //     "src/canonical/models/front-shiny",
    //     "src/canonical/models/front-shiny-cosmetic",
    // );
    // ignore(() => {
    //     sel(
    //         "src/cap/models/front-shiny",
    //         "src/cap/sprites/gen5/front-shiny",
    //     );
    // });
    
    // dest("ani-back-shiny");
    // sel(
    //     "src/canonical/models/back-shiny",
    //     "src/canonical/models/back-shiny-cosmetic",
    // );
    // ignore(() => {
    //     sel(
    //         "src/cap/models/back-shiny",
    //         "src/cap/sprites/gen5/back-shiny"
    //     );
    // });

    dest("gen5ani");
    sel(
        "src/cap/sprites/gen5/front"
    );

    dest("gen5ani-back");
    sel(
        "src/cap/sprites/gen5/back"
    );

    // for (const canon of ["canonical", "cap"]) {
    //     dest("afd");
    //     sel(
    //         `src/afd/sprites-${canon}/front`,
    //         `src/afd/sprites-${canon}/front-cosmetic`,
    //     )

    //     dest("afd-shiny");
    //     sel(
    //         `src/afd/sprites-${canon}/front-shiny`,
    //         `src/afd/sprites-${canon}/front-shiny-cosmetic`,
    //     )

    //     dest("afd-back");
    //     sel(
    //         `src/afd/sprites-${canon}/back`,
    //         `src/afd/sprites-${canon}/back-cosmetic`,
    //     )

    //     dest("afd-back-shiny");
    //     sel(
    //         `src/afd/sprites-${canon}/back-shiny`,
    //         `src/afd/sprites-${canon}/back-shiny-cosmetic`,
    //     );
    // }

    // TODO
    // dest("dex");
    // sel(
    //     "build/padded-dex/canonical/front",
    //     "build/padded-dex/canonical/front-cosmetic",
    //     "build/padded-dex/cap/front",
    //     "build/padded-dex/cap/front-cosmetic",
    // );

    // dest("dex-shiny");
    // sel(
    //     "build/padded-dex/canonical/front-shiny",
    //     "build/padded-dex/canonical/front-shiny-cosmetic",
    //     "build/padded-dex/cap/front",
    //     "build/padded-dex/cap/front-cosmetic",
    // );
});

transform(toPSID, () => {
    dest("ani");
    sel("src/canonical/models/front-misc/Substitute.gif");

    dest("ani-back");
    sel("src/canonical/models/back-misc/Substitute.gif");

    dest("afd");
    sel("src/afd/sprites-canonical/front-misc/Substitute.png");
    
    dest("afd-back");
    sel("src/afd/sprites-canonical/back-misc/Substitute.png");

    dest("misc");
    sel(
        "src/canonical/ui/battle/Alpha.png",
        "src/canonical/ui/battle/Mega.png",
        "src/canonical/ui/battle/Omega.png",
    );
});

// TODO: reenable when trainers are moved
// dest("trainers");
// sel("build/padded-trainers/canonical");

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

dest("categories");
sel(
    "src/canonical/ui/categories/gen4",
    "src/noncanonical/ui/categories/undefined.png",
);

dest(".");
sel("build/ps/pokemonicons-pokeball-sheet.png");
// TODO
//sel("build/ps/trainers-sheet.png");
sel("build/ps/itemicons-sheet.png");
