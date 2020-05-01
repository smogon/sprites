
import pathlib from 'path';
import fs from 'fs';
import crypto from 'crypto';
import os from 'os';

function join(...paths) {
    return pathlib.join(os.tmpdir(), ...paths);
}

// Adapted from https://stackoverflow.com/a/61312694
function mktemp(prefix) {
    return join(`${prefix}.${crypto.randomBytes(6).readUIntLE(0,6).toString(36)}`);
}

export function asTmp(prefix, src, f) {
    const parsed = pathlib.parse(src);
    const dst = mktemp(prefix + "." + parsed.name) + parsed.ext;
    // This has an astronomically low chance of throwing, but if it does, you
    // can just restart the build.
    fs.copyFileSync(src, dst, fs.constants.COPYFILE_EXCL);
    try {
        const {changed, ret} = f(dst);
        if (changed) {
            fs.copyFileSync(dst, src);
        }
        return ret;
    } finally {
        fs.unlinkSync(dst);
    }
}
