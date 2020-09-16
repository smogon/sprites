
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

function compresspng(opts)
    local cmds = {}
    local output = opts.output or "%o"
    local pngquant = getconfig("DEFAULT_PNGQUANT")
    local optipng = getconfig("DEFAULT_OPTIPNG")
    local advpng = getconfig("DEFAULT_ADVPNG")
    local deflopt = booleanconfig("DEFAULT_DEFLOPT")
    if opts.config then
        pngquant = getconfig(opts.config .. "_PNGQUANT") or pngquant;
        optipng = getconfig(opts.config .. "_OPTIPNG") or optipng;
        advpng = getconfig(opts.config .. "_ADVPNG") or advpng;
        deflopt = booleanconfig(opts.config .. "_DEFLOPT") or deflopt;
    end

    if pngquant then
        cmds += rep{"pngquant ${opts} ${output}", opts=pngquant, output=output}
    end
    if optipng then
        cmds += rep{"optipng -q ${opts} ${output}", opts=optipng, output=output}
    end
    if advpng then
        cmds += rep{"advpng -q ${opts} ${output}", opts=advpng, output=output}
    end
    if deflopt then
        cmds += rep{"node ${root}/tools/deflopt ${output}",
                    root=ROOTDIR,
                    output=output}
    end
    
    return cmds
end
