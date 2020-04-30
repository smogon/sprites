
import program from 'commander';
import {run} from './lang.js';
import {find} from './find.js';
import {link} from './deploy.js';

program
    .command('deploy <tag> <outputDir>')
    .option('-d, --dir [dir]', 'Directory')
    .action((tag, outputDir, opts) => {
        const dir = opts.dir || '.';
        const results = run(find(dir, tag));
        link(results, outputDir);
    });

program
    .command('print <tag>')
    .option('-d, --dir [dir]', 'Directory')
    .option('--json', 'As JSON')
    .action((tag, opts) => {
        const dir = opts.dir || '.';
        const results = run(find(dir, tag));
        if (opts.json) {
            process.stdout.write(JSON.stringify(results, null, '  ') + "\n");
        } else {
            for (const {src, dst} of results) {
                console.log(`${src} ==> ${dst}`);
            } 
        }
    });

program.parse(process.argv);

if (process.argv.slice(2).length === 0) {
    program.outputHelp();
}

