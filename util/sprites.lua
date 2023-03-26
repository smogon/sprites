
-- Similar to `parseFilename` in data/lib
function spritedata(basename)
    local iter = basename:gmatch("[^-]+")
    local result = {id = iter(), data = {}}
    for flagtext in iter do
        if flagtext:len() == 1 then
            result.data[flagtext] = true
        else
            local flag = flagtext:sub(1, 1)
            local text = flagtext:sub(2)
            result.data[flag] = text
        end
    end
    return result
end

function spriteglob(pat, flagspec)
    local results = glob(pat)
    local function fn(filename)
        local sd = spritedata(tup.base(filename))
        for k, v in pairs(flagspec or {}) do
            -- Make sure both are booleans
            if not not v ~= not not sd.data[k] then
                return false
            end
        end
        return true
    end
    filter(results, fn)
    return results
end
