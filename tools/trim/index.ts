
import {parseArgs} from 'util';

import * as image from './image.ts';

let {values: opts, positionals: files} = parseArgs({
    options: {
        check: {type: 'boolean', short: 'c'},
        verbose: {type: 'boolean', short: 'v'},
        force: {type: 'boolean', short: 'f'},
    },
    allowPositionals: true,
});

let retVal = 0;

for (let file of files) {
    let dims = image.getDims(file);
    let alreadyCropped = (dims.left === 0 || dims.right === 0) &&
          (dims.top === 0 || dims.bottom === 0);

    if (opts.verbose) {
        let msg = `${file}: ${dims.width}x${dims.height}, `;
        if (alreadyCropped) {
            msg += `displacement horiz ${dims.left - dims.right}, vert ${dims.top - dims.bottom}`;
        } else {
            msg += `padding left ${dims.left}, top ${dims.top}, right ${dims.right}, bottom ${dims.bottom}`;
        }
        console.log(msg);
    }

    if (opts.check && !alreadyCropped) {
        retVal = 1;
        if (!opts.verbose) {
            break;
        }
    }
        
    if (!opts.check && (!alreadyCropped || opts.force)) {
        let trimDims = image.losslessTrim(dims);
        image.crop(file, trimDims, file);
    }
}

process.exit(retVal);
