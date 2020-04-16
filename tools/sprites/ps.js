
require('make-promises-safe');

const program = require('commander');
const spritesmith = require('spritesmith');
const path = require('path');
const fs = require('fs');
const util = require('util');

const run = util.promisify(spritesmith.run);

program
    .option('--output-image <file>', 'where to put image')
    .option('--output-metadata <file>', 'where to put JSON metadata')
    .parse(process.argv);

const files = [];

for (const directory of program.args) {
    for (const file of fs.readdirSync(directory)) {
        files.push(path.join(directory, file));
    }
}

function decode(s) {
    return s.replace(/_(....)/g, (_, m) => String.fromCharCode(parseInt(m, 16)));
}

function toPSID(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

(async () => {
    const result = await run({
        src: files,
    });

    const sprites = Object.create(null);
    for (const [filename, {x, y, width, height}] of Object.entries(result.coordinates)) {
        const id = toPSID(decode(path.parse(filename).name));
        sprites[id] = {left: x, top: y};
    }

    fs.writeFileSync(program.outputImage, result.image, 'binary');
    fs.writeFileSync(program.outputMetadata, JSON.stringify(sprites, null, 4));
})();
