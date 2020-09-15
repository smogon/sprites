
import program from 'commander';

import {deflopt} from './deflopt.js';

program
    .arguments('<file>')
    .action((file : string) => {
        const {processed, rewritten} = deflopt(file);
        if (processed !== 1) {
            console.error(`Didn't process any files.`);
            process.exit(1);
        }
    }).parse(process.argv);

