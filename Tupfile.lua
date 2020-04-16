
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

for dir in iter{"asymmetrical", "custom", "misc", "pokemon"} do
    for file in iglob{"src/minisprites/gen6/" .. dir .. "/*"} do
        padsprite(file,
                  "build/gen6-minisprites-padded/" .. dir .. "/" .. tup.file(file),
                  40, 30)
    end
end

-- Forum sprites

for file in iglob{"build/gen6-minisprites-padded/pokemon/*"} do
    local base = toSmogonAlias(decodeBase(file))
    symlink(file,
            "build/smogon/forumsprites/" .. base .. ".png")
end

-- PS spritesheet

tup.rule(
    "build/gen6-minisprites-padded/pokemon/*",
    "node tools/sprites/ps.js build/gen6-minisprites-padded/pokemon/ --output-image build/ps/pokemonicons-sheet.png --output-metadata build/ps/pokemonicons.json",
    {"build/ps/pokemonicons-sheet.png", "build/ps/pokemonicons.json"}
)

-- PS models

for file in iglob{"src/models/front/*", "src/models/front-cosmetic/*", "src/models/front-misc/*"} do
    local output = toPSSpriteID(decodeBase(file)) .. "." .. tup.ext(file)
    symlink(file, "build/ps/ani/" .. output)
end

for file in iglob{"src/models/back/*", "src/models/back-cosmetic/*", "src/models/back-misc/*"} do
    local output = toPSSpriteID(decodeBase(file)) .. "." .. tup.ext(file)
    symlink(file, "build/ps/ani-back/" .. output)
end

for file in iglob{"src/models/shiny/*", "src/models/shiny-cosmetic/*"} do
    local output = toPSSpriteID(decodeBase(file)) .. "." .. tup.ext(file)
    symlink(file, "build/ps/ani-shiny/" .. output)
end

for file in iglob{"src/models/back-shiny/*", "src/models/back-shiny-cosmetic/*"} do
    local output = toPSSpriteID(decodeBase(file)) .. "." .. tup.ext(file)
    symlink(file, "build/ps/ani-back-shiny/" .. output)
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

for file in iglob{"src/models/front/*"} do
    local base = toSmogonAlias(decodeBase(file))
    symlink(file, "build/smogon/xy/" .. base .. ".%e")
    fbsprite(file, "build/smogon/fbsprites/xy/" .. base .. ".png")
    twittersprite(file, "build/smogon/twittersprites/xy/" .. base .. ".png")
end


