
-- Some Tup convenience functions extracted from Smogon's old build system

-- TODO: extract treerule() for naming intermediates?

function glob(pats)
    local results = {}
    for pat in iter(astable(pats)) do
        results += tup.glob(pat)
    end
    return results
end

-- Convenience iterator so you can do
-- `for path in iglob{...}` instead of `for path in iter(glob{...})`
function iglob(pats)
    return iter(glob(pats))
end
