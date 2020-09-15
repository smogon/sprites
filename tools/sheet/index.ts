
import 'make-promises-safe';
import cp from 'child_process';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const sheetjs = process.argv[2];
const dest = process.argv[3];

if (!sheetjs || !dest) {
    throw new Error(`node tools/sheet <file.sheet.js> <dest>`);
}

// Must have file:/// for Windows
const {default: sheet} = await import(path.join("file:///", process.cwd(), sheetjs));

for (let i = 0; i < sheet.entries.length; i++) {
    if (sheet.entries[i] === undefined)
        throw new Error(`gap: ${i}`);
    if (sheet.entries[i] === null) {
        // ImageMagick blank entry
        sheet.entries[i] = "xc:transparent";
    }
}

// Store list of sprite files in a temp file, Windows can't handle large cli arg
// lists. Just append a random string to the dest file
const tmpFile = `${dest}.tmp.${crypto.randomBytes(6).readUIntLE(0,6).toString(36)}`;
fs.writeFileSync(tmpFile, sheet.entries.join("\n"), 'utf8');

cp.execFileSync("magick", [
    "montage",
    `@${tmpFile}`,
    "-background", "transparent",
    "-geometry", `${sheet.width}x${sheet.height}>`,
    "-gravity", "center",
    "-tile", `${sheet.tile}x`,
    "-depth", "8",
    dest
]);

fs.unlinkSync(tmpFile);
