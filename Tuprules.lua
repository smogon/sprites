
tup.include("util/strict.lua")
tup.include("util/lua-ext.lua")
tup.include("util/tup-ext.lua")

function pad(w, h, input, output)
    return rep{
        "convert {input} -background transparent -gravity center -extent {w}x{h} {output}",
        input = input,
        output = output,
        w = w,
        h = h
    }
end

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
