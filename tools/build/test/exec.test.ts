
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {runShell} from '../exec.ts';

test('runShell runs && chains from stdin and reports exit status', async () => {
    const signal = new AbortController().signal;
    const ok = await runShell('echo one && echo two', {cwd: process.cwd(), signal});
    assert.equal(ok.code, 0);
    assert.equal(ok.output, 'one\ntwo\n');
    const bad = await runShell('echo partial && false && echo never', {cwd: process.cwd(), signal});
    assert.equal(bad.code, 1);
    assert.equal(bad.output, 'partial\n');
});

