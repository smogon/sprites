
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {parseConfig} from '../config.ts';

test('parseConfig parses values with spaces and equals', () => {
    const cfg = parseConfig([
        '# comment',
        '',
        'MODELS_OPTIPNG=-o7',
        'MINISPRITE_ADVPNG = -z4 -i100 ',
        'WEIRD=a=b',
        '#DISABLED=x',
    ].join('\n'));
    assert.deepEqual([...cfg], [
        ['MODELS_OPTIPNG', '-o7'],
        ['MINISPRITE_ADVPNG', '-z4 -i100'],
        ['WEIRD', 'a=b'],
    ]);
});

test('parseConfig rejects malformed lines', () => {
    assert.throws(() => parseConfig('NOVALUE'), /Invalid config line/);
});
