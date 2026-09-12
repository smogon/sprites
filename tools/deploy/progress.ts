// A one-line progress bar for the publishing step of a deploy, which is
// otherwise a long silent wait: thousands of files being packed into an
// upload or copied into a staging tree, with nothing on the terminal between
// the line naming the command and the line after it finishes.
//
// Only drawn when stderr is a terminal. Piped or under CI a redraw per file
// is noise in the log, and the deploy's own stdout lines are the record of
// what happened; those are printed either way, and never carry the bar.

let REDRAW_MS = 100;
// Below this a bar is more misleading than a bare count.
let MIN_BAR = 10;

// The parts of a terminal a bar uses, so a test can hand it one.
export type Term = {
    isTTY?: boolean | undefined,
    columns?: number | undefined,
    write(s: string): unknown,
};

export class Progress {
    #label: string;
    #total: number;
    #term: Term;
    #done: number;
    #drawn: boolean;
    #lastDraw: number;

    constructor(label: string, total: number, term: Term = process.stderr) {
        this.#label = label;
        this.#total = total;
        this.#term = term;
        this.#done = 0;
        this.#drawn = false;
        this.#lastDraw = 0;
        if (this.#interactive) {
            this.#draw();
        }
    }

    get #interactive(): boolean {
        return this.#term.isTTY === true && this.#total > 0;
    }

    tick(n = 1) {
        this.#done = Math.min(this.#done + n, this.#total);
        if (!this.#interactive) {
            return;
        }
        // The line is the bar's only while there is progress left to show.
        // What the command has to say about the rest of the wait -- it is
        // still running, with the terminal to itself -- lands on a clean line
        // instead of on the end of a finished bar.
        if (this.#done === this.#total) {
            this.finish();
            return;
        }
        // Redraw on a timer rather than per file: a deploy ticks tens of
        // thousands of times.
        if (Date.now() - this.#lastDraw < REDRAW_MS) {
            return;
        }
        this.#draw();
    }

    // Leave the line as the deploy found it: the bar is a live thing, and
    // what stays in the scrollback is the deploy's own output.
    finish() {
        if (this.#drawn) {
            this.#term.write('\x1b[2K\r');
            this.#drawn = false;
        }
    }

    #draw() {
        this.#lastDraw = Date.now();
        let columns = this.#term.columns || 80;
        // Pad the count so the bar keeps its width as the numbers grow into
        // each other's columns.
        let counts = `${String(this.#done).padStart(String(this.#total).length)}/${this.#total}`;
        // label, a space, '[', ']', a space, counts, and a column to spare.
        let width = columns - this.#label.length - counts.length - 5;
        let line;
        if (width < MIN_BAR) {
            line = `${this.#label} ${counts}`;
        } else {
            let filled = Math.round(width * this.#done / this.#total);
            line = `${this.#label} [${'#'.repeat(filled)}${'-'.repeat(width - filled)}] ${counts}`;
        }
        // One column short of the width: writing the last one wraps to the
        // next line on some terminals, which leaves the bar behind.
        this.#term.write(`\x1b[2K\r${line.slice(0, columns - 1)}`);
        this.#drawn = true;
    }
}

// Draw a bar over `body`'s work, and leave the line clean however it goes.
export async function withProgress<T>(label: string, total: number,
                                      body: (tick: () => void) => Promise<T>): Promise<T> {
    let bar = new Progress(label, total);
    try {
        return await body(() => bar.tick());
    } finally {
        bar.finish();
    }
}
