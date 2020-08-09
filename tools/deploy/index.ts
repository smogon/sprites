
import program from 'commander';
import * as script from './script.js';
import * as pathlib from './path.js';
import nodePath from 'path';
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
            aq.print();
        }
    });

program
    .command('run [scripts...]')
    .requiredOption('-o, --output <dir>', 'Output directory')
    .option('-n, --no-act', 'No act')
    .action((scripts : string[], {output: outputDir, act}) => {
        const aq = new script.ActionQueue;

        for (const file of scripts) {
            const code = fs.readFileSync(file, 'utf8');
            const scr = new script.Script(code);
            scr.run(nodePath.dirname(file), outputDir, aq);
        }
        
        if (act) {
            aq.run('link');
        } else {
            aq.print();
        }
    });

program.parse(process.argv);

if (process.argv.slice(2).length === 0) {
    program.outputHelp();
}

