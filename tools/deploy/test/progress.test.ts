
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {Progress, type Term} from '../progress.ts';

function term(overrides: Partial<Term> = {}): Term & {written: string[]} {
    let written: string[] = [];
    return {isTTY: true, columns: 80, write: (s: string) => written.push(s), written, ...overrides};
}

// Every write the bar makes, with the clear-and-return prefix stripped.
function lines(t: {written: string[]}): string[] {
    return t.written.map(s => s.replace('\x1b[2K\r', ''));
}

test('a bar draws nothing when stderr is not a terminal', () => {
    let t = term({isTTY: false});
    let bar = new Progress('deploy: uploading', 4, t);
    for (let i = 0; i < 4; i++) {
        bar.tick();
    }
    bar.finish();
    assert.deepEqual(t.written, []);
});

test('a bar draws its label, a filled share of the width, and the counts', () => {
    let t = term();
    let bar = new Progress('up', 100, t);
    // The timer holds the redraws back, so drive it to the end and read the
    // first draw, which the constructor always makes.
    let [first] = lines(t);
    assert.equal(first, `up [${'-'.repeat(66)}]   0/100`);
    assert.equal(first!.length, 79);
    for (let i = 0; i < 50; i++) {
        bar.tick();
    }
    assert.equal(lines(t).length, 1);
});

test('a bar never writes past the terminal width', () => {
    for (let columns of [20, 40, 80, 200]) {
        let t = term({columns});
        new Progress('deploying something', 1000, t);
        for (let line of lines(t)) {
            assert.ok(line.length < columns, `${line.length} >= ${columns} at ${columns} columns`);
        }
    }
});

test('a narrow terminal gets the counts without a bar', () => {
    let t = term({columns: 24});
    new Progress('up', 1000, t);
    assert.deepEqual(lines(t), ['up    0/1000']);
});

test('a bar clears its line once it is full, leaving the rest of the wait alone', () => {
    let t = term();
    let bar = new Progress('up', 2, t);
    bar.tick();
    bar.tick();
    assert.equal(t.written.at(-1), '\x1b[2K\r');
    assert.equal(lines(t).at(-1), '');
    // Already cleared: finishing again is not a second clear.
    let count = t.written.length;
    bar.finish();
    assert.equal(t.written.length, count);
});

test('finishing a bar mid-run clears the line it drew', () => {
    let t = term();
    let bar = new Progress('up', 100, t);
    bar.tick();
    bar.finish();
    assert.equal(t.written.at(-1), '\x1b[2K\r');
});
