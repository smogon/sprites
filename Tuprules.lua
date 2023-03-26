
tup.include("util/strict.lua")
tup.include("util/lua-ext.lua")
tup.include("util/tup-ext.lua")
tup.include("util/sprites.lua")

ROOTDIR = tup.getcwd()

function pad(opts)
    return rep{
        "magick convert ${input} -background transparent -gravity center -extent ${w}x${h} ${output}",
        input = opts.input or "%f",
        output = opts.output or "%o",
        w = opts.w,
        h = opts.h
    }
end

function trimimg(opts) -- Can't just be trim because of the string function...
    return rep{
        "magick convert ${input} -trim ${output}",
        input = opts.input or "%f",
        output = opts.output or "%o",
    }
end

local function compressopts(program, copts)
    copts.pngquant = getconfig(program .. "_PNGQUANT") or copts.pngquant
    copts.optipng = getconfig(program .. "_OPTIPNG") or copts.optipng
    copts.advpng = getconfig(program .. "_ADVPNG") or copts.advpng
end

function compresspng(opts)
    local cmds = {}
    local output = opts.output or "%o"
    local copts = {}
    compressopts("DEFAULT", copts)
    if opts.config then
        compressopts(opts.config, copts)
    end
    if copts.pngquant then
        -- -f -o necessary to overwrite existing file
        cmds += rep{"pngquant -f -o ${output} ${opts} ${output}", opts=copts.pngquant, output=output}
    end
    if copts.optipng then
        cmds += rep{"optipng -q ${opts} ${output}", opts=copts.optipng, output=output}
    end
    if copts.advpng then
        cmds += rep{"advpng -q ${opts} ${output}", opts=copts.advpng, output=output}
    end
    
    return cmds
end
