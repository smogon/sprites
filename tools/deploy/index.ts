
import program from 'commander';
import * as script from './script.js';
import nodePath from 'path';

function collect(value : string, previous : string[]) {
    return previous.concat([value]);
}

program
    .command('copy [files...]')
    .option('-o, --output <dir>', 'Output directory')
    // TODO: default toID
    .option('-e, --eval <expr>', 'Expr')
    .option('-m, --module <mod>', 'Module')
    // TODO
    // .option('-t, --tag <tag>', 'Tag', collect, [])
    // from rename(1)
    .action(async (files : string[], {eval: expr, module: mod, output: outputDir}) => {
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
            try {
                const dst = script.runOnFile(scr, src);
                aq.copy(src, dst);
            } catch(e) {
                // Move to script.runOnFile?
                aq.throw(e);
            }
        }
        
        if (outputDir) {
            if (!aq.valid) {
                aq.print();
                process.exit(1);
            }
            aq.run(outputDir, 'copy');
        } else {
            aq.print();
        }
    });

program
    .command('run [scripts...]')
    .option('-o, --output <dir>', 'Output directory')
    .action((scripts : string[], {output: outputDir}) => {
        const aq = new script.ActionQueue;

        for (const file of scripts) {
            try {
                const scr = new script.Script(file, 'file');
                script.run(scr, nodePath.dirname(file), aq);
            } catch(e) {
                // Move to script.run?
                aq.throw(e);
            }
        }
        
        if (outputDir) {
            if (!aq.valid) {
                aq.print();
                process.exit(1);
            }
            aq.run(outputDir, 'link');
        } else {
            aq.print();
        }
    });

program.parse(process.argv);

if (process.argv.slice(2).length === 0) {
    program.outputHelp();
}

