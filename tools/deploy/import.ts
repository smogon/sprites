
import fs from 'fs';
import vm from 'vm';
import pathlib from 'path';

export function imp(files: string[], code : string) {
    const script = new vm.Script(code);

    const results = [];
    for (const file of files) {
        const parsed = pathlib.parse(file);
        const obj = {dir: parsed.dir,
                     base: parsed.name,
                     ext: parsed.ext === "" ? null : parsed.ext.slice(1)
                    };
        const output = script.runInNewContext({path: obj, ...obj});
        if (typeof output === 'string') {
            const dest = pathlib.format({name: output, ext: parsed.ext});
            results.push({src: file, dst: dest});
        } else {
            throw new Error(`result of eval on ${file} not string`);
        }
    }
    return results;
}
