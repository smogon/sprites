
-- Allow `for v in iter(table)` instead of `for _, v in ipairs(table)`
function iter(table)
    local i = 1
    return function ()
        local v = table[i]
        i = i + 1
        return v
    end
end

function astable(table)
    local t = type(table)
    if t == 'table' then
        return table
    elseif t == 'string' then
        return {table}
    elseif t == 'nil' then
        return {}
    end
end

-- Lua 5.1, which ships with Tup, does not have a way of creating a string from
-- a unicode codepoint...
-- 
-- https://stackoverflow.com/a/7799843
function unichr(ord)
    if ord == nil then return nil end
    if ord < 32 then return string.format('\\x%02x', ord) end
    if ord < 126 then return string.char(ord) end
    if ord < 65539 then return string.format("\\u%04x", ord) end
    if ord < 1114111 then return string.format("\\u%08x", ord) end
end
