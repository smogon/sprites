
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

function booleanconfig(str)
    local v = getconfig(str)
    if v == nil or v == "false" then
        return false
    elseif v == "true" then
        return true
    else
        error("boolean config must be true, false, or empty")
    end
end

--
-- Globs
--

-- Workaround weird bug pre reported, where final path segment has two //
-- EDIT: AND workaround a bug Marty reported on Windows, where final path segment has a /\
local old_tup_glob = tup.glob
function tup.glob(pat)
    local results = old_tup_glob(pat)
    for i = 1, #results do
        results[i] = results[i]:gsub("/\\", "/"):gsub("//", "/")
    end
    return results
end

-- A glob pattern is either an interpolated string, or a table of glob patterns
-- globpat_normalize("foo/*") --> {"foo/*"}
-- globpat_normalize({"foo/*"}) --> {"foo/*"}
local function globpat_normalize(pat)
    if type(pat) == "string" then
        return {pat}
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
    for pat in iter(globpat_normalize(pat)) do
        for file in iter(tup.glob(pat)) do
            table.insert(results, file)
        end
    end
    return results
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
        return tup.foreach_rule(input, cmd, output)
    else
        return tup.rule(input, cmd, output)
    end
end

function rule(input, cmd, output)
    return do_rule(input, cmd, output, false)
end

function foreach_rule(input, cmd, output)
    return do_rule(input, cmd, output, true)
end

