--

local function rep_fn(f, var, modifier)
    local v = f(var)
    if v == nil then
        error("unknown substitution: " .. var)
    end
    if modifier ~= nil then
        if modifier == "b" then
            return tup.file(v)
        elseif modifier == "B" then
            return tup.base(v)
        elseif modifier == "e" then
            return tup.ext(v)
        else
            error("unknown modifier: " .. modifier)
        end
    else
        return v
    end
end

-- Lua doesn't have alternation...
local function do_rep(prefix, str, fn)
    str = str:gsub(prefix .. "{(%a+)}",
                   function(var)
                       return rep_fn(fn, var, nil)
                   end
    )
    str = str:gsub(prefix .. "{(%a+):(%a)}",
                   function(var, modifier)
                       return rep_fn(fn, var, modifier)
                   end
    )
    str = str:gsub(prefix .. "(%a)",
                   function(var)
                       if var == "f" then
                           return rep_fn(fn, "input", nil)
                       elseif var == "b" then
                           return rep_fn(fn, "input", "b")
                       elseif var == "B" then
                           return rep_fn(fn, "input", "B")
                       elseif var == "o" then
                           return rep_fn(fn, "output", nil)
                       end
                   end
    )
    return str
end

function rep(args)
    local str = args[1]
    local vars = args
    return do_rep(
        "$",
        str,
        function(var)
            return vars[var]
        end
    )
end

-- Variable interpolation with dynamic scoping

local FRAMES = {}

function push_frame(frame)
    table.insert(FRAMES, frame)
end

function pop_frame()
    table.remove(FRAMES)
end

function print_frame()
    local last_frame = FRAMES[#FRAMES]
    for k, v in pairs(last_frame) do
        print("frame", k, v)
    end
end

function dim(var)
    for i = #FRAMES, 1, -1 do
        if FRAMES[i][var] ~= nil then
            return FRAMES[i][var]
        end
    end
end

function expand(str)
    return do_rep(
        "%%",
        str,
        function(var)
            return dim(var)
        end
    )
end

function with_rep(vars, f)
    push_frame(vars)
    local ret = f()
    pop_frame()
    return ret
end

function iter_rep(varspec, f)
    local frame = {}
    push_frame(frame)
    local keys = table_keys(varspec)
    local function loop(i)
        if #keys + 1 == i then
            f()
        else
            local k = keys[i]
            for v in iter(varspec[k]) do
                frame[k] = v
                loop(i+1)
            end
        end
    end
    loop(1)
    pop_frame()
end

