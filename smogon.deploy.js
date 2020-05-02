
transform(toSmogonAlias, () => {
    dest("forumsprites");
    sel(
        "build/gen6-minisprites-padded/canonical/pokemon",
        "build/gen6-minisprites-padded/cap/pokemon"
    );

    dest("fbsprites/xy");
    sel("build/smogon/fbsprites/xy");

    dest("twittersprites/xy");
    sel("build/smogon/twittersprites/xy");
});

