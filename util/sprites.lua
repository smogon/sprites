
function spritedata(basename)
    local iter = basename:gmatch("[^-]+")
    local result = {id = iter(), data = {}}
    for flagtext in iter do
        if flagtext:len() == 1 then
            result.data[flagtext] = true
        else
            local flag = flagtext.sub(1, 1)
            local text = flagtext.sub(2)
            result.data[flag] = text
        end
    end
    return result
end
