
tup.include("util/strict.lua")
tup.include("util/lua-ext.lua")
tup.include("util/tup-ext.lua")

-- Generate uniform size minisprites

function pad(w, h, input, output)
    return rep{
        "convert {input} -background transparent -gravity center -extent {w}x{h} {output}",
        input = input,
        output = output,
        w = w,
        h = h
    }
end

for canon in iter{"canonical", "noncanonical"} do 
    for dir in iter{"asymmetrical", "custom", "misc", "pokemon"} do
        -- TODO fix this, tup hates git's quirk of not creating directories when
        -- there aren't any files
        if canon == "noncanonical" and dir ~= "pokemon" then
            goto continue
        end

        tup.foreach_rule(
            rep{"src/{canon}/minisprites/gen6/{dir}/*", canon=canon, dir=dir},
            "^ pad g6 minisprite %f^ " .. pad(40, 30, "%f", "%o"),
            rep{"build/gen6-minisprites-padded/{canon}/{dir}/%b",canon=canon,dir=dir}
        )
        
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

-- Trainers

-- TODO: move some of these to util, when we figure out the precise abstractions desired

function compresspng(filename, opts)
    local cmds = {}
    if opts.optipng then
        cmds += rep{"optipng -q {opts} {filename}", opts=opts.optipng, filename=filename}
    end
    if opts.advpng then
        cmds += rep{"advpng -q {opts} {filename}", opts=opts.advpng, filename=filename}
    end
    return cmds
end

function makecmd(cmds)
    return table.concat(flatten(cmds), " && ")
end

tup.foreach_rule(
    {"src/canonical/trainers/*"},
    "^ pad trainer %f^ " .. makecmd{pad(80, 80, "%f", "%o"), compresspng("%f",  {})},
    {"build/padded-trainers/canonical/%b"}
)



