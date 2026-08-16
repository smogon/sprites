
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {getRules, resetRules, rule} from '../api.ts';
import {BuildError, checkGraph} from '../graph.ts';

test('checkGraph rejects duplicate outputs', () => {
    resetRules();
    rule('a.png', ['c1 %f %o'], 'out/x.png');
    rule('b.png', ['c2 %f %o'], 'out/x.png');
    assert.throws(() => checkGraph(getRules()), BuildError);
});

test('checkGraph rejects cycles', () => {
    resetRules();
    rule('gen/y', ['c1 %f %o'], 'gen/x');
    rule('gen/x', ['c2 %f %o'], 'gen/y');
    assert.throws(() => checkGraph(getRules()), /cycle/i);
});

test('checkGraph orders producers before consumers', () => {
    resetRules();
    rule('gen/mid', ['consume %f %o'], 'out/final');
    rule('src/a', ['produce %f %o'], 'gen/mid');
    const {order, generated} = checkGraph(getRules());
    assert.deepEqual(order.map(r => r.outputs[0]), ['gen/mid', 'out/final']);
    assert.deepEqual([...generated].sort(), ['gen/mid', 'out/final']);
});
