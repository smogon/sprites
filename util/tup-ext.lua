
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

-- Workaround weird bug pre reported, where final path segment has two //
local old_tup_glob = tup.glob
function tup.glob(pat)
    local results = old_tup_glob(pat)
    for i = 1, #results do
        results[i] = results[i]:gsub("//", "/")
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
    local filter = opts and opts.filter
    local key = opts and opts.key
    local seen = {}
    for pat in iter(globpat_normalize(pat)) do
        for file in iter(tup.glob(pat)) do
            if key then
                local k = key(file)
                if seen[k] then
                    goto continue
                end
                seen[k] = true
            end

            if filter then
                if not filter(file) then
                    goto continue
                end
            end

            table.insert(results, file)
            ::continue::
        end
    end
    return results
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

