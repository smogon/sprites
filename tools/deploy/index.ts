
import program from 'commander';
import * as script from './script.ts';
import nodePath from 'path';
import {spawn, type ChildProcess} from 'child_process';

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

function waitExit(child : ChildProcess) : Promise<number | null> {
    return new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', code => resolve(code));
    });
}

program
    .command('deploy [scripts...]')
    .option('-v, --verbose', 'Verbose')
    .action(async (scripts : string[], {verbose}) => {
        try {
            process.loadEnvFile('.env');
        } catch {
            console.error(`missing .env; set DEPLOY_COMMAND="ssh smogon smogonctl assets upload"`);
            process.exit(1);
        }
        const command = process.env.DEPLOY_COMMAND;
        if (command === undefined) {
            console.error(`DEPLOY_COMMAND not set in .env`);
            process.exit(1);
        }

        const build = spawn('pnpm', ['build'], {stdio: ['ignore', 'inherit', 'inherit']});
        if (await waitExit(build) !== 0) {
            process.exit(1);
        }

        const aq = new script.ActionQueue;
        for (const file of scripts) {
           const scr = new script.Script(file, 'file');
           script.run(scr, nodePath.dirname(file), aq);
        }
        if (!aq.valid) {
            aq.print(verbose ? 'all' : 'errors');
            process.exit(1);
        }

        const upload = spawn(command, {shell: true, stdio: ['pipe', 'inherit', 'inherit']});
        // If the command dies early we report its exit code; don't also crash
        // on the resulting EPIPE.
        upload.stdin!.on('error', () => {});
        aq.pack().pipe(upload.stdin!);
        if (await waitExit(upload) !== 0) {
            process.exit(1);
        }
    });

program.parse(process.argv);

if (process.argv.slice(2).length === 0) {
    program.outputHelp();
}
