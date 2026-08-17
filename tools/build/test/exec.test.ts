
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {runShell} from '../exec.ts';

test('runShell runs && chains from stdin and reports exit status', async () => {
    let signal = new AbortController().signal;
    let ok = await runShell('echo one && echo two', {cwd: process.cwd(), signal});
    assert.equal(ok.code, 0);
    assert.equal(ok.output, 'one\ntwo\n');
    let bad = await runShell('echo partial && false && echo never', {cwd: process.cwd(), signal});
    assert.equal(bad.code, 1);
    assert.equal(bad.output, 'partial\n');
});

