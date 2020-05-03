
-- Generate uniform size minisprites

foreach_rule{
    display="pad g6 minisprite %f",
    input="src/%{canon}/minisprites/gen6/%{dir}/*.png",
    command=pad{w=40, h=30},
    output="build/gen6-minisprites-padded/%{canon}/%{dir}/%b",
    dimensions={
        canon={"canonical", "cap"},
        dir={"asymmetrical", "custom", "misc", "pokemon"}
    }
}

-- PS spritesheet

rule{
    input={"build/gen6-minisprites-padded/canonical/pokemon/*",
           "build/gen6-minisprites-padded/cap/pokemon/*"},
    command="node tools/sprites/ps.js build/gen6-minisprites-padded/canonical/pokemon/ build/gen6-minisprites-padded/cap/pokemon/ --output-image build/ps/pokemonicons-sheet.png --output-metadata build/ps/pokemonicons.json",
    output={"build/ps/pokemonicons-sheet.png",
            "build/ps/pokemonicons.json"}
}

-- PS pokeball icons

local balls = {
    "src/noncanonical/ui/battle/Ball-Normal.png",
    "src/noncanonical/ui/battle/Ball-Sick.png",
    "src/noncanonical/ui/battle/Ball-Null.png",
}

rule{
    display="pokemonicons-pokeball-sheet",
    input=balls,
    command={
        "convert -background transparent -gravity center -extent 40x30 %f +append %o",
        compresspng{config="SPRITESHEET"}
    },
    output={"build/ps/pokemonicons-pokeball-sheet.png"}
}

-- Smogdex social images

foreach_rule{
    display="fbsprite %f",
    input={"src/cap/models/front/*", "src/cap/sprites/gen5/front/*", "src/canonical/models/front/*"},
    key="%B",
    command={
        "tools/fbsprite.sh %f %o",
        compresspng{config="MODELS"}
    },
    output="build/smogon/fbsprites/xy/%B.png"
}

foreach_rule{
    display="twittersprite %f",
    input={"src/cap/models/front/*", "src/cap/sprites/gen5/front/*", "src/canonical/models/front/*"},
    key="%B",
    command={
        "tools/twittersprite.sh %f %o",
        compresspng{config="MODELS"}
    },
    output="build/smogon/twittersprites/xy/%B.png"
}


-- Trainers

foreach_rule{
    display="pad trainer %f",
    input={"src/canonical/trainers/*"},
    command={
        pad{w=80, h=80},
        compresspng{config="TRAINERS"}
    },
    output={"build/padded-trainers/canonical/%b"}
}

-- Padded Dex

foreach_rule{
    display="pad dex %f",
    input="src/%{canon}/dex/%{dir}/*",
    command={
        pad{w=120, h=120},
        compresspng{config="DEX"}
    },
    output="build/padded-dex/%{canon}/%{dir}/%b",
    dimensions={
        canon={"canonical", "cap"},
        dir={"front", "front-cosmetic", "front-shiny", "front-shiny-cosmetic"}
    }
}

-- Build missing CAP dex

foreach_rule{
    input={"src/cap/sprites/gen5/%{folder}/*.gif", "src/cap/models/%{folder}/*.gif"},
    display="missing dex cap %B -> %{folder}/%f",
    command={
        "convert %f'[0]' -trim %o",
        "mogrify -background transparent -gravity center -extent 120x120 %o",
        compresspng{config="DEX"}
    },
    key="%B",
    filter=function()
        return not glob_matches("src/cap/dex/%{folder}/%B.png")
    end,
    output="build/padded-dex/cap/%{folder}/%B.png",
    dimensions={
        folder={"front", "front-shiny", "front-cosmetic", "front-shiny-cosmetic"}
    }
}

