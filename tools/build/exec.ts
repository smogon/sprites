
import {spawn} from 'child_process';

export interface ExecResult {
    code : number | null;
    signal : NodeJS.Signals | null;
    output : string;
    durationMs : number;
}

const livePids = new Set<number>();

// Emergency stop (e.g. second Ctrl-C): SIGKILL every live process group.
export function killAllProcessGroups() : void {
    for (const pid of livePids) {
        try {
            process.kill(-pid, 'SIGKILL');
        } catch {}
    }
}

// The command script is fed to sh via stdin rather than -c: a single argv
// entry is capped by the kernel (MAX_ARG_STRLEN, ~128KB) and the largest %f
// expansion is already 80KB+.
export function runShell(command : string, opts : {cwd : string, signal : AbortSignal}) : Promise<ExecResult> {
    return new Promise((resolve, reject) => {
        const start = performance.now();
        // detached: own process group, so an abort kills grandchildren
        // (magick, optipng, ...) with one signal
        const child = spawn('sh', [], {cwd: opts.cwd, detached: true, stdio: ['pipe', 'pipe', 'pipe']});
        if (child.pid !== undefined) {
            livePids.add(child.pid);
        }
        const chunks : Buffer[] = [];
        child.stdout.on('data', c => chunks.push(c));
        child.stderr.on('data', c => chunks.push(c));
        child.stdin.on('error', () => {});  // EPIPE if the shell exits early
        child.stdin.end(command + '\n');

        let killTimer : NodeJS.Timeout | undefined;
        const kill = (sig : NodeJS.Signals) => {
            try {
                process.kill(-child.pid!, sig);
            } catch {}
        };
        const onAbort = () => {
            kill('SIGTERM');
            killTimer = setTimeout(() => kill('SIGKILL'), 5000);
            killTimer.unref();
        };
        if (opts.signal.aborted) {
            onAbort();
        } else {
            opts.signal.addEventListener('abort', onAbort, {once: true});
        }

        const cleanup = () => {
            if (child.pid !== undefined) {
                livePids.delete(child.pid);
            }
            opts.signal.removeEventListener('abort', onAbort);
            if (killTimer !== undefined) {
                clearTimeout(killTimer);
            }
        };
        child.on('error', err => {
            cleanup();
            reject(err);
        });
        child.on('close', (code, signal) => {
            cleanup();
            resolve({
                code,
                signal,
                output: Buffer.concat(chunks).toString(),
                durationMs: performance.now() - start,
            });
        });
    });
}

// A worker that throws stops its own loop, but the pool always waits for
// every other worker to finish before rethrowing: failing fast here would
// return control (and e.g. close the database) while rules are still running.
export async function workerPool<T>(items : readonly T[], jobs : number,
                                    fn : (item : T, index : number) => Promise<void>) : Promise<void> {
    let next = 0;
    const workers = [];
    for (let i = 0; i < Math.max(1, Math.min(jobs, items.length)); i++) {
        workers.push((async () => {
            while (next < items.length) {
                const index = next++;
                await fn(items[index]!, index);
            }
        })());
    }
    const results = await Promise.allSettled(workers);
    for (const result of results) {
        if (result.status === 'rejected') {
            throw result.reason;
        }
    }
}
