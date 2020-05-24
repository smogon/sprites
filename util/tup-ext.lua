
--
-- Configuration
--

-- getconfig returning an empty string on absence is inconvenient
function getconfig(str)
    local v = tup.getconfig(str)
    if v == "" then
        return nil
    else
        return v
    end
end

--
-- Globs
--

-- A glob pattern is either an interpolated string, or a table of glob patterns
--
-- A normalized glob pattern is a table of strings, with interpolation resolved.
-- globpat_normalize("foo/*") --> {"foo/*"}
-- globpat_normalize({"foo/*"}) --> {"foo/*"}
-- globpat_normalize({"foo/*", {"{bar}/*"}}) --> {"foo/*", "baz_value/*"}
local function globpat_normalize(pat)
    if type(pat) == "string" then
        return {expand(pat)}
    elseif type(pat) == 'table' then
        local result = {}
        for x in iter(pat) do
            result += globpat_normalize(x)
        end
        return result
    else
        error("bad globpat")
    end
end

function glob(pat, opts)
    local results = {}
    local filter = opts and opts.filter
    local key = opts and opts.key
    local seen = {}
    for pat in iter(globpat_normalize(pat)) do
        local frame = {}
        push_frame(frame)
        for file in iter(tup.glob(pat)) do
            -- Workaround a weird issue pre reported
            file = file:gsub("//", "/")
            frame.input = file
            
            if key then
                local k = expand(key)
                if seen[k] then
                    goto continue
                end
                seen[k] = true
            end

            if filter then
                if not filter() then
                    goto continue
                end
            end

            table.insert(results, file)
            ::continue::
        end
        pop_frame()
    end
    return results
end

-- Convenience iterator so you can do
-- `for path in iglob{...}` instead of `for path in iter(glob{...})`
function iglob(pat, opts)
    return iter(glob(pat, opts))
end


function glob_matches(pat, opts)
    local matched = glob(pat, opts)
    return #matched > 0
end

-- Commands

local function cspec2cmd(cmdSpec)
    local cmd = ""
    for newcmd in iter(flatten(astable(cmdSpec))) do
        newcmd = trim(newcmd)
        if cmd ~= "" then
            cmd = cmd .. " &&\n"
        end
        cmd = cmd .. newcmd
    end
    -- Abstract over tup's arcane display override
    if cmdSpec.display then
        cmd = rep{"^ ${display}^ ${cmd}", display=cmdSpec.display, cmd=cmd}
    end
    return cmd
end

local function do_rule(input, cspec, output, foreach)
    local cmd = cspec2cmd(cspec)
    if foreach then
        tup.foreach_rule(input, cmd, output)
    else
        tup.rule(input, cmd, output)
    end
end

function rule(input, cmd, output)
    return do_rule(input, cmd, output, false)
end

function foreach_rule(input, cmd, output)
    return do_rule(input, cmd, output, true)
end

