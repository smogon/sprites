
import cp from 'child_process';

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

function parse(re, output) {
    const m = output.match(re);
    if (!m) {
        throw new Error(`Can't match output: ` + output);
    }
    const num = parseInt(m[1], 10);
    return num;
}

export function deflopt(exe, file) {
    // DeflOpt doesn't like absolute paths, it thinks they are Windows-style
    // command line switches.
    file = file.replace(/\//g, "\\");
    
    const output = cp.execFileSync(
        "wine",
        [exe, file],
        {encoding: 'utf8',
         // Wine doesn't even like it when the current directory is on fuse!
         // What a persnickety program!
         cwd: '/'});
    const processed = parse(PROCESSED_RE, output);
    const rewritten = parse(REWRITTEN_RE, output);
    return {processed, rewritten};
}
