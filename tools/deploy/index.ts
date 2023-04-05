
import program from 'commander';
import * as script from './script.js';
import nodePath from 'path';

function collect(value : string, previous : string[]) {
    return previous.concat([value]);
}

async function runAq(aq : script.ActionQueue, mode: 'copy' | 'link' | 'tar', outputDir : undefined | string, verbose : undefined | true) {
    const level = verbose ? 'all' : 'errors';
    if (!aq.valid) {
        aq.print(level);
        process.exit(1);
    }
    if (outputDir !== undefined) {
        await aq.run(outputDir, mode);
    } else {
        if (level === 'errors') {
            console.error(`Success, but nothing to do. Please rerun with -v or -o`);
        } else {
            aq.print('all');
        }
    }
}

program
    .command('copy [files...]')
    .option('-o, --output <dir>', 'Output directory')
    // TODO: default toID
    .option('-e, --eval <expr>', 'Expr')
    .option('-m, --module <mod>', 'Module')
    .option('-v, --verbose', 'Verbose')
    .option('--link', 'Link')
    .option('--tar', 'Tar')
    // TODO
    // .option('-t, --tag <tag>', 'Tag', collect, [])
    // from rename(1)
    .action(async (files : string[], {eval: expr, module: mod, output: outputDir, verbose, link, tar}) => {
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
            script.runOnFile(scr, src, aq);
        }

        await runAq(aq, tar ? 'tar' : link ? 'link' : 'copy', outputDir, verbose);
    });

program
    .command('run [scripts...]')
    .option('-o, --output <dir>', 'Output directory')
    .option('-v, --verbose', 'Verbose')
    .option('--link', 'Link')
    .option('--tar', 'Tar')
    .action(async (scripts : string[], {output: outputDir, verbose, link, tar}) => {
        const aq = new script.ActionQueue;

        for (const file of scripts) {
           const scr = new script.Script(file, 'file');
           script.run(scr, nodePath.dirname(file), aq);
        }

        await runAq(aq, tar ? 'tar' : link ? 'link' : 'copy', outputDir, verbose);
    });

program.parse(process.argv);

if (process.argv.slice(2).length === 0) {
    program.outputHelp();
}
