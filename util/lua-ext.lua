
--
-- Strings
--

function trim(s)
    return s:gsub("^%s*(.-)%s*$", "%1")
end

function rep(args)
    local str = args[1]
    local vars = args
    local function fn(var)
        local v = vars[var]
        if v == nil then
            error("unknown substitution: " .. var)
        end
        return v
    end
    -- Note: not equivalent to return str:gsub(...) due to multiple return values!
    str = str:gsub("${(%a+)}", fn)
    return str
end

--
-- Tables
--

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

-- Adapted from premake
function flatten(arr)
    local result = {}
    
    local function flatten(arr)
        for v in iter(arr) do
            if type(v) == "table" then
                flatten(v)
            else
                table.insert(result, v)
            end
        end
    end
    
    flatten(arr)
    return result
end

-- Adapted from https://stackoverflow.com/a/53038524
function filter(t, fn)
    local j, n = 1, #t

    for i=1,n do
        if fn(t[i]) then
            -- Move i's kept value to j's position, if it's not already there.
            if (i ~= j) then
                t[j] = t[i]
                t[i] = nil
            end
            j = j + 1 -- Increment position of where we'll place the next kept value.
        else
            t[i] = nil
        end
    end

    return t
end
