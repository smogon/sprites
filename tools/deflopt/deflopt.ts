
import cp from 'child_process';
import root from '@smogon/sprite-root';

/*
  Output looks something like:

***                 DeflOpt V2.07                 ***
***       Built on Wed Sep  5 18:56:30 2007       ***
***  Copyright (C) 2003-2007 by Ben Jos Walbeehm  ***




Number of files processed  :        0
Number of files rewritten  :        0
Total number of bytes saved:        0
2,097,357 cycles.
 */

const PROCESSED_RE = /Number of files processed  : *([0-9]+)/;
const REWRITTEN_RE = /Number of files rewritten  : *([0-9]+)/;

function parse(re : RegExp, output : string) {
    const m = output.match(re);
    if (!m) {
        throw new Error(`Can't match output: ` + output);
    }
    const num = parseInt(m[1], 10);
    return num;
}

const DEFLOPT_EXE = `${root}/vendor/DeflOpt.exe`;

export function deflopt(file : string) {
    file = file.replace(/\//g, "\\");

    let cmd, args;
    if (process.platform === 'win32') {
        cmd = DEFLOPT_EXE;
        args = [file];
    } else {
        cmd = "wine";
        // DeflOpt doesn't like absolute paths, it thinks they are Windows-style
        // command line switches.
        args = [DEFLOPT_EXE, file];
    }

    const output = cp.execFileSync(cmd, args, {encoding: 'utf8'});
    const processed = parse(PROCESSED_RE, output);
    const rewritten = parse(REWRITTEN_RE, output);
    return {processed, rewritten};
}
