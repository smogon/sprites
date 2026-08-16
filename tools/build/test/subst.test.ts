
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {basenameNoExt, flattenCmds, substitute} from '../subst.ts';

test('substitute expands %f/%o/%b/%B', () => {
    assert.equal(
        substitute('convert %f -x %o', ['src/a.png'], ['build/a.png']),
        'convert src/a.png -x build/a.png');
    assert.equal(
        substitute('%f + %b + %B', ['src/d/x.tar.gz', 'y.png'], []),
        'src/d/x.tar.gz y.png + x.tar.gz y.png + x.tar y');
});

test('substitute handles quoted frame selector', () => {
    assert.equal(
        substitute('magick convert "%f[0]" -trim %o', ['src/models/a.gif'], ['out/a.png']),
        'magick convert "src/models/a.gif[0]" -trim out/a.png');
});

test('substitute rejects unknown escapes', () => {
    assert.throws(() => substitute('%d', ['a'], ['b']), /Unknown substitution/);
});

test('flattenCmds flattens, trims, drops empties', () => {
    assert.deepEqual(
        flattenCmds(['a', ['  b ', [], ['c', '']], 'd']),
        ['a', 'b', 'c', 'd']);
});

test('basenameNoExt', () => {
    assert.equal(basenameNoExt('src/dex/10001-b.png'), '10001-b');
    assert.equal(basenameNoExt('noext'), 'noext');
    assert.equal(basenameNoExt('a/.hidden'), '.hidden');
});
