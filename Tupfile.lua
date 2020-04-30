
tup.include("util/strict.lua")
tup.include("util/lua-ext.lua")
tup.include("util/tup-ext.lua")
tup.include("util/pokemon.lua")

-- Generate uniform size minisprites

function padsprite(input, output, w, h)
    tup.foreach_rule(
        input,
        "^ padsprite %f^ tools/padsprite.sh %f %o " .. w .. " " .. h,
        output
    )
end

for canon in iter{"canonical", "noncanonical"} do 
    for dir in iter{"asymmetrical", "custom", "misc", "pokemon"} do
        -- TODO fix this, tup hates git's quirk of not creating directories when
        -- there aren't any files
        if canon == "noncanonical" and dir ~= "pokemon" then
            goto continue
        end
            
        for file in iglob{"src/" .. canon .. "/minisprites/gen6/" .. dir .. "/*"} do
            padsprite(file,
                      "build/gen6-minisprites-padded/" .. canon .. "/" .. dir .. "/" .. tup.file(file),
                      40, 30)
        end
        ::continue::
    end
end

-- PS spritesheet

tup.rule(
    {"build/gen6-minisprites-padded/canonical/pokemon/*", "build/gen6-minisprites-padded/noncanonical/pokemon/*"},
    "node tools/sprites/ps.js build/gen6-minisprites-padded/canonical/pokemon/ build/gen6-minisprites-padded/noncanonical/pokemon/ --output-image build/ps/pokemonicons-sheet.png --output-metadata build/ps/pokemonicons.json",
    {"build/ps/pokemonicons-sheet.png", "build/ps/pokemonicons.json"}
)

-- Smogdex social images

function fbsprite(input, output)
    tup.foreach_rule(
        input,
        "^ fbsprite %f^ tools/fbsprite.sh %f %o",
        output
    )
end

function twittersprite(input, output)
    tup.foreach_rule(
        input,
        "^ twittersprite %f^ tools/twittersprite.sh %f %o",
        output
    )
end

local files =
    {"src/canonical/models/front/*", "src/noncanonical/models/front/*",
     -- TODO: only pick noncanonical that aren't already in models/
     "src/noncanonical/sprites/gen5/front/*"}

fbsprite(files, "build/smogon/fbsprites/xy/%B.png")
twittersprite(files, "build/smogon/twittersprites/xy/%B.png")

