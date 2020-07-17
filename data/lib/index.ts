
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const libdir = path.join(__dirname, "../..");

export type Type = {
    num: number,
    formeNum: number,
    base: string,
    forme: string,
    sid: number
};

const species : Record<number, Type> = JSON.parse(fs.readFileSync(path.join(libdir, "species.json"), 'utf8'));

const result = new Map<number, Type>();

for (const entry of Object.values(species)) {
    result.set(entry.sid, entry);
}

export default result;

