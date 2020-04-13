
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
