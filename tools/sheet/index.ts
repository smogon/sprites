
import 'make-promises-safe';
import cp from 'child_process';
import path from 'path';

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

// Write list of filenames to stdin, Windows can't handle large cli arg lists.
// Before we wrote a tmp file and deleted it afterwards, but apparently tup
// can't track unlinkSync on Windows?
const proc = cp.spawn("magick", [
    "montage",
    "@-",
    "-background", "transparent",
    "-geometry", `${sheet.width}x${sheet.height}>`,
    "-gravity", "center",
    "-tile", `${sheet.tile}x`,
    "-depth", "8",
    dest
], {
    stdio: ['pipe', 'inherit', 'inherit']
});

for (const entry of sheet.entries) {
    proc.stdin.write(entry + "\n");
}
proc.stdin.end();

proc.on('exit', (code, signal) => {
    if (code || signal) {
        process.exitCode = 1;
    }
});
