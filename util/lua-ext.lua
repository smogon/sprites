
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
    local result = { }
    
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

-- Adapted from lua wiki, originally called replace_vars
function rep(str, vars)
  -- Allow replace_vars{str, vars} syntax as well as replace_vars(str, {vars})
  if not vars then
    vars = str
    str = vars[1]
  end
  return (str:gsub("({([^}]+)})",
    function(whole,i)
      return vars[i] or whole
    end))
end

-- Merge, preferring elem2 when f(elem1) == f(elem2) 
function mergededup(table1, table2, f)
    local seen = {}
    for v in iter(table1) do
        seen[f(v)] = v
    end
    for v in iter(table2) do
        seen[f(v)] = v
    end
    local result = {}
    -- Can't be iter, because non-numeric keys
    for _, v in pairs(seen) do
        table.insert(result, v)
    end
    return result
end

function trim(s)
    return s:gsub("^%s*(.-)%s*$", "%1")
end
