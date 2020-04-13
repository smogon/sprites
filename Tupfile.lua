
tup.include("util/strict.lua")
tup.include("util/lua-ext.lua")
tup.include("util/tup-ext.lua")
tup.include("util/pokemon.lua")

for file in iglob{"src/models/front/*", "src/models/front-cosmetic/*"} do
    local output = toPSSpriteID(decodeFS(tup.base(file))) .. "." .. tup.ext(file)
    tup.rule(file, "ln -s ../../../%f %o", "build/ps/ani/" .. output)
end

for file in iglob{"src/models/back/*", "src/models/back-cosmetic/*"} do
    local output = toPSSpriteID(decodeFS(tup.base(file))) .. "." .. tup.ext(file)
    tup.rule(file, "ln -s ../../../%f %o", "build/ps/ani-back/" .. output)
end

for file in iglob{"src/models/front/*"} do
    local output = toSmogonAlias(decodeFS(tup.base(file))) .. "." .. tup.ext(file)
    tup.rule(file, "ln -s ../../../%f %o", "build/smogon/xy/" .. output)
end