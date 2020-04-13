
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
