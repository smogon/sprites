
import program from 'commander';
import * as script from './script.js';
import nodePath from 'path';

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
        let scr;
        if (expr !== undefined) {
            scr = new script.Script(expr, 'expr');
        } else if (mod !== undefined) {
            scr = new script.Script(mod, 'file');
        } else {
            throw new Error(`one of -e or -m must be provided`);
        }

        const aq = new script.ActionQueue;
        
        for (const src of files) {
            const dst = script.runOnFile(scr, src);
            aq.copy(src, dst);
        }
        
        if (act) {
            aq.run(outputDir, 'copy');
        } else {
            aq.print(outputDir);
        }
    });

program
    .command('run [scripts...]')
    .requiredOption('-o, --output <dir>', 'Output directory')
    .option('-n, --no-act', 'No act')
    .action((scripts : string[], {output: outputDir, act}) => {
        const aq = new script.ActionQueue;

        for (const file of scripts) {
            const scr = new script.Script(file, 'file');
            script.run(scr, nodePath.dirname(file), aq);
        }
        
        if (act) {
            aq.run(outputDir, 'link');
        } else {
            aq.print(outputDir);
        }
    });

program.parse(process.argv);

if (process.argv.slice(2).length === 0) {
    program.outputHelp();
}

