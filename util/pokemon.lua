
function decodeFS(filename)
    return filename:gsub('__(%x%x%x%x)',
                   function(hex)
                       return utf8.char(tonumber(hex, 16))
                   end):gsub('_', ' ')
end

function decodeBase(filename)
    return decodeFS(tup.base(filename))
end

function toPSID(name)
    name = name:lower()
    name = name:gsub("[^a-z0-9]+", '')
    return name
end

-- "Necrozma--Dawn-Wings" -> {base = "Necrozma", forme = "Dawn-Wings"}
function decomposeName(name)
    local sepStart = name:find("%-%-")
    if sepStart == nil then
        return {base = name, forme = nil}
    else
        local base = name:sub(1, sepStart)
        local forme = name:sub(sepStart+2)
        return {base = base, forme = forme}
    end
end

-- "Necrozma--Dawn-Wings" -> "necrozma-dawnwings"
function toPSSpriteID(name)
    local info = decomposeName(name)
    local result = toPSID(info.base)
    if info.forme ~= nil then
        if info.forme == 'Female' then
            info.forme = 'F'
        end
        result = result .. "-" .. toPSID(info.forme)
    end
    return result
end

-- "Necrozma--Dawn-Wings" -> "necrozma-dawn-wings"
function toSmogonAlias(name)
    name = name:lower()
    name = name:gsub("%-%-", "-")
    name = name:gsub("[ _]+", "-")
    name = name:gsub("[^a-z0-9-]+", "")
    return name
end
