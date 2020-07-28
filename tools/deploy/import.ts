
import fs from 'fs';
import vm from 'vm';
import * as pathlib from './path.js';

export function imp(files: string[], code : string) {
    const script = new vm.Script(code);

    const results = [];
    for (const file of files) {
        const parsed = pathlib.parse(file);
        const delta = script.runInNewContext({path: parsed, ...parsed});
        if (delta) {
            const result = pathlib.path(parsed, delta);
            const dest = pathlib.format(result);
            results.push({src: file, dst: dest});
        } else {
            throw new Error(`result of eval on ${file} falsy`);
        }
    }
    return results;
}
