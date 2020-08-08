
import program from 'commander';
import {run} from './lang.js';
import {find} from './find.js';
import {link} from './deploy.js';
import * as script from './script.js';
import * as pathlib from './path.js';
import fs from 'fs';

function collect(value : string, previous : string[]) {
    return previous.concat([value]);
}

program
    .command('copy [files...]')
    .requiredOption('-o, --output <dir>', 'Output directory')
    // TODO: default toID
    .option('-e, --eval <expr>', 'Expr')
    .option('-m, --module <mod>', 'Module')
    // TODO
    // .option('-t, --tag <tag>', 'Tag', collect, [])
    // from rename(1)
    .option('-n, --no-act', 'No act')
    .action(async (files : string[], {eval: expr, module: mod, output: outputDir, /*tag: tags,*/ act}) => {
        let code : string;
        if (expr !== undefined) {
            code = `(${expr})`;
        } else if (mod !== undefined) {
            code = fs.readFileSync(mod, 'utf8');
        } else {
            throw new Error(`one of -e or -m must be provided`);
        }

        const aq = new script.ActionQueue;
        const scr = new script.Script(code);

        for (const file of files) {
            const src = pathlib.path(file);
            const output = scr.runOnFile(src);
            const dst = pathlib.join(outputDir, output);
            aq.copy(src, dst);
        }
        
        if (act) {
            aq.run('copy');
        } else {
            for (const {src, dst} of aq.describe()) {
                console.log(`${pathlib.format(src)} ==> ${pathlib.format(dst)}`);
            } 
        }
    });

program
    .command('deploy <tag> <outputDir>')
    .option('-d, --dir [dir]', 'Directory')
    .action((tag : string, outputDir : string, opts) => {
        const dir = opts.dir || '.';
        const results = run(find(dir, tag));
        link(results, outputDir, 'link');
    });

program
    .command('print <tag>')
    .option('-d, --dir [dir]', 'Directory')
    .option('--json', 'As JSON')
    .action((tag : string, opts) => {
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

