
import cp from 'child_process';
import path from 'path';
import BattleAvatarNumbers from './data-trainers.js';

const type = process.argv[2];
const dir = process.argv[3];
const dest = process.argv[4];

if (!dir || !dest) {
    throw new Error(`node tools/ps-sheet <type> <dir> <dest>`);
}

if (type === 'trainers') {
    // Guaranteed to be in the right order by V8, but iirc not by other JS engines.
    const trainers = Object.values(BattleAvatarNumbers).map(t => path.join(dir, t) + ".png");

    cp.execFileSync("montage", [
        ...trainers,
        "-background", "transparent",
        "-geometry", "80x80>",
        "-gravity", "center",
        "-tile", "16x",
        "-depth", "8",
        dest
    ]);
} else {
    throw new Error(`unknown type: ${type}`);
}
