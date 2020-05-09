
import cp from 'child_process';
import path from 'path';

const sheetjs = process.argv[2];
const dest = process.argv[3];

if (!sheetjs || !dest) {
    throw new Error(`node tools/ps-sheet <file.sheet.js> <dest>`);
}

// Top-level await?
(async() => {
    const {default: sheet} = await import(path.join(process.cwd(), sheetjs));

    cp.execFileSync("montage", [
        ...sheet.entries,
        "-background", "transparent",
        "-geometry", `${sheet.width}x${sheet.height}>`,
        "-gravity", "center",
        "-tile", `${sheet.tile}x`,
        "-depth", "8",
        dest
    ]);
})();
