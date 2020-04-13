
tup.include("util/strict.lua")
tup.include("util/lua-ext.lua")
tup.include("util/tup-ext.lua")
tup.include("util/pokemon.lua")

for file in iglob{"src/models/front/*", "src/models/front-cosmetic/*"} do
    local output = toPSSpriteID(decodeBase(file)) .. "." .. tup.ext(file)
    tup.rule(file, "ln -s ../../../%f %o", "build/ps/ani/" .. output)
end

for file in iglob{"src/models/back/*", "src/models/back-cosmetic/*"} do
    local output = toPSSpriteID(decodeBase(file)) .. "." .. tup.ext(file)
    tup.rule(file, "ln -s ../../../%f %o", "build/ps/ani-back/" .. output)
end

for file in iglob{"src/models/shiny/*", "src/models/shiny-cosmetic/*"} do
    local output = toPSSpriteID(decodeBase(file)) .. "." .. tup.ext(file)
    tup.rule(file, "ln -s ../../../%f %o", "build/ps/ani-shiny/" .. output)
end

for file in iglob{"src/models/back-shiny/*", "src/models/back-shiny-cosmetic/*"} do
    local output = toPSSpriteID(decodeBase(file)) .. "." .. tup.ext(file)
    tup.rule(file, "ln -s ../../../%f %o", "build/ps/ani-back-shiny/" .. output)
end


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
    tup.foreach_rule(file, "ln -s ../../../%f %o", "build/smogon/xy/" .. base .. ".%e")
    fbsprite(file, "build/smogon/fbsprites/xy/" .. base .. ".png")
    twittersprite(file, "build/smogon/twittersprites/xy/" .. base .. ".png")
end
