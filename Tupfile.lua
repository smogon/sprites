
-- Generate uniform size minisprites

for canon in iter{"canonical", "cap"} do 
    for dir in iter{"asymmetrical", "custom", "misc", "pokemon"} do
        -- TODO fix this, tup hates git's quirk of not creating directories when
        -- there aren't any files
        if canon == "cap" and dir ~= "pokemon" then
            goto continue
        end

        tup.foreach_rule(
            rep{"src/{canon}/minisprites/gen6/{dir}/*", canon=canon, dir=dir},
            makecmd{
                display="pad g6 minisprite %f",
                pad{w=40, h=30}
            },
            rep{"build/gen6-minisprites-padded/{canon}/{dir}/%b",canon=canon,dir=dir}
        )
        
        ::continue::
    end
end

-- PS spritesheet

tup.rule(
    {"build/gen6-minisprites-padded/canonical/pokemon/*", "build/gen6-minisprites-padded/cap/pokemon/*"},
    "node tools/sprites/ps.js build/gen6-minisprites-padded/canonical/pokemon/ build/gen6-minisprites-padded/cap/pokemon/ --output-image build/ps/pokemonicons-sheet.png --output-metadata build/ps/pokemonicons.json",
    {"build/ps/pokemonicons-sheet.png", "build/ps/pokemonicons.json"}
)

-- PS pokeball icons

local balls = {
    "src/noncanonical/ui/battle/Ball-Normal.png",
    "src/noncanonical/ui/battle/Ball-Sick.png",
    "src/noncanonical/ui/battle/Ball-Null.png",
}

tup.rule(
    balls,
    makecmd{
        display="pokemonicons-pokeball-sheet",
        [[
convert -background transparent -gravity center -extent 40x30 %f +append %o
]],
        compresspng{config="SPRITESHEET"}
    },
    {"build/ps/pokemonicons-pokeball-sheet.png"}
)

-- Smogdex social images

function fbsprite(input, output)
    tup.foreach_rule(
        input,
        makecmd{
            display="fbsprite %f",
            "tools/fbsprite.sh %f %o",
            compresspng{config="MODELS"}
        },
        output
    )
end

function twittersprite(input, output)
    tup.foreach_rule(
        input,
        makecmd{
            display="twittersprite %f",
            "tools/twittersprite.sh %f %o",
            compresspng{config="MODELS"}
        },
        output
    )
end

-- TODO: nicer API
local files = mergededup(
    glob("src/cap/sprites/gen5/front/*"),
    glob{"src/canonical/models/front/*", "src/cap/models/front/*"},
    tup.base
)

fbsprite(files, "build/smogon/fbsprites/xy/%B.png")
twittersprite(files, "build/smogon/twittersprites/xy/%B.png")

-- Trainers

tup.foreach_rule(
    {"src/canonical/trainers/*"},
    makecmd{
        display="pad trainer %f",
        pad{w=80, h=80},
        compresspng{config="TRAINERS"}
    },
    {"build/padded-trainers/canonical/%b"}
)

-- Padded Dex

for dir in iter{"front", "front-cosmetic", "front-shiny", "front-shiny-cosmetic"} do
    tup.foreach_rule(
        rep{"src/canonical/dex/{dir}/*", dir=dir},
        makecmd{
            display="pad dex %f",
            pad{w=120, h=120},
            compresspng{config="DEX"}
        },
        rep{"build/padded-dex/canonical/{dir}/%b", dir=dir}
    )
end
