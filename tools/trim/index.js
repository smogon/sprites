
import program from 'commander';
import * as image from './image.js';

program
    .option('-c, --check', 'Check only')
    .option('-v, --verbose', 'Print info')
    .option('-f, --force', 'Force write even when already cropped')
    .parse(process.argv);

let retVal = 0;

for (const file of program.args) {
    const dims = image.getDims(file);
    const alreadyCropped = (dims.left === 0 || dims.right === 0) &&
          (dims.top === 0 || dims.bottom === 0);

    if (program.verbose) {
        let msg = `${file}: ${dims.width}x${dims.height}, `;
        if (alreadyCropped) {
            msg += `displacement horiz ${dims.left - dims.right}, vert ${dims.top - dims.bottom}`;
        } else {
            msg += `padding left ${dims.left}, top ${dims.top}, right ${dims.right}, bottom ${dims.bottom}`;
        }
        console.log(msg);
    }

    if (program.check && !alreadyCropped) {
        retVal = 1;
        if (!program.verbose) {
            break;
        }
    }
        
    if (!program.check && (!alreadyCropped || program.force)) {
        const trimDims = image.losslessTrim(dims);
        image.crop(file, trimDims, file);
    }
}

process.exit(retVal);
