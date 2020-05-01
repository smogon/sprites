
-- Some Tup convenience functions extracted from Smogon's old build system

-- TODO: extract treerule() for naming intermediates?

function glob(pats)
    local results = {}
    for pat in iter(astable(pats)) do
        for file in iter(tup.glob(pat)) do
            -- Workaround a weird issue pre reported
            file = file:gsub("//", "/")
            table.insert(results, file)
        end
    end
    return results
end

-- Convenience iterator so you can do
-- `for path in iglob{...}` instead of `for path in iter(glob{...})`
function iglob(pats)
    return iter(glob(pats))
end

function symlink(input, output)
    -- The path must be relative from output, walk back to the root
    local prefix = ""
    for _ in output:gmatch("/") do
        prefix = "../" .. prefix
    end
    tup.foreach_rule(
        input,
        "^ symlink %f -> %o^ ln -s " .. prefix .. "%f %o",
        output
    )
end

function makecmd(cmds)
    return table.concat(flatten(cmds), " && ")
end
