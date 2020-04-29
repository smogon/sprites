
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

-- Forum sprites

for file in iglob{"build/gen6-minisprites-padded/canonical/pokemon/*", "build/gen6-minisprites-padded/noncanonical/pokemon/*"} do
    local base = toSmogonAlias(decodeBase(file))
    symlink(file,
            "build/smogon/forumsprites/" .. base .. ".png")
end

-- PS spritesheet

tup.rule(
    {"build/gen6-minisprites-padded/canonical/pokemon/*", "build/gen6-minisprites-padded/noncanonical/pokemon/*"},
    "node tools/sprites/ps.js build/gen6-minisprites-padded/canonical/pokemon/ build/gen6-minisprites-padded/noncanonical/pokemon/ --output-image build/ps/pokemonicons-sheet.png --output-metadata build/ps/pokemonicons.json",
    {"build/ps/pokemonicons-sheet.png", "build/ps/pokemonicons.json"}
)

-- PS models

tup.rule(
    {"src/canonical/models/front/*", "src/canonical/models/front-cosmetic/*", "src/canonical/models/front-misc/*", "src/noncanonical/models/front/*", "src/noncanonical/sprites/gen5/front/*"},
    "node tools/gendeploy.js src/canonical/models/front src/canonical/models/front-cosmetic src/canonical/models/front-misc src/noncanonical/models/front src/noncanonical/sprites/gen5/front ani %o",
    "build/ps/ani.deploy.json"
)

for file in iglob{"src/canonical/models/back/*", "src/canonical/models/back-cosmetic/*", "src/canonical/models/back-misc/*", "src/noncanonical/models/back/*",
                  -- TODO: only pick noncanonical that aren't already in models/
                  "src/noncanonical/sprites/gen5/back/*"} do
    local output = toPSSpriteID(decodeBase(file)) .. "." .. tup.ext(file)
    symlink(file, "build/ps/ani-back/" .. output)
end

for file in iglob{"src/canonical/models/front-shiny/*", "src/canonical/models/front-shiny-cosmetic/*"} do
    local output = toPSSpriteID(decodeBase(file)) .. "." .. tup.ext(file)
    symlink(file, "build/ps/ani-shiny/" .. output)
end

for file in iglob{"src/canonical/models/back-shiny/*", "src/canonical/models/back-shiny-cosmetic/*"} do
    local output = toPSSpriteID(decodeBase(file)) .. "." .. tup.ext(file)
    symlink(file, "build/ps/ani-back-shiny/" .. output)
end

-- PS AFD

for file in iglob{"src/noncanonical/sprites/afd/front/*", "src/noncanonical/sprites/afd/front-cosmetic/*"} do
    local output = toPSSpriteID(decodeBase(file)) .. "." .. tup.ext(file)
    symlink(file, "build/ps/afd/" .. output)
end

for file in iglob{"src/noncanonical/sprites/afd/back/*", "src/noncanonical/sprites/afd/back-cosmetic/*"} do
    local output = toPSSpriteID(decodeBase(file)) .. "." .. tup.ext(file)
    symlink(file, "build/ps/afd-back/" .. output)
end

for file in iglob{"src/noncanonical/sprites/afd/front-shiny/*", "src/noncanonical/sprites/afd/front-shiny-cosmetic/*"} do
    local output = toPSSpriteID(decodeBase(file)) .. "." .. tup.ext(file)
    symlink(file, "build/ps/afd-shiny/" .. output)
end

for file in iglob{"src/noncanonical/sprites/afd/back-shiny/*", "src/noncanonical/sprites/afd/back-shiny-cosmetic/*"} do
    local output = toPSSpriteID(decodeBase(file)) .. "." .. tup.ext(file)
    symlink(file, "build/ps/afd-back-shiny/" .. output)
end

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

for file in iglob{"src/canonical/models/front/*", "src/noncanonical/models/front/*",
                  -- TODO: only pick noncanonical that aren't already in models/
                  "src/noncanonical/sprites/gen5/front/*"} do
    local base = toSmogonAlias(decodeBase(file))
    symlink(file, "build/smogon/xy/" .. base .. ".%e")
    fbsprite(file, "build/smogon/fbsprites/xy/" .. base .. ".png")
    twittersprite(file, "build/smogon/twittersprites/xy/" .. base .. ".png")
end


