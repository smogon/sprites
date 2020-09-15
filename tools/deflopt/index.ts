
import program from 'commander';

import {deflopt} from './deflopt.js';

program
    .option('--wine', 'Run executable with Wine')
    .arguments('<file>')
    .action((file : string, {wine} : {wine?: boolean}) => {
        const {processed, rewritten} = deflopt({file, wine: !!wine});
        if (processed !== 1) {
            console.error(`Didn't process any files.`);
            process.exit(1);
        }
    }).parse(process.argv);

