
import assert from 'node:assert/strict';
import {beforeEach, test} from 'node:test';

import {type Input, computeKey, forEachRule, memo, resetDecls, rule} from '../artifact.ts';

beforeEach(resetDecls);

function digests(map : Record<string, string>) : (i : Input) => string {
    return i => {
        if (typeof i !== 'string') {
            return i.hash;
        }
        const d = map[i];
        assert.ok(d !== undefined, `no digest for ${i}`);
        return d;
    };
}

test('rule declares artifacts with nominal names', () => {
    const [png, css] = rule('src/a.png', ['tool %f %o1 %o2'], ['sheet.png', 'sheet.css']);
    assert.equal(png!.name, 'sheet');
    assert.equal(png!.ext, 'png');
    assert.equal(css!.filename, 'sheet.css');
    assert.deepEqual(png!.sources, ['src/a.png']);
    assert.equal(png!.decl, css!.decl);
    assert.throws(() => png!.hash, /not been built/);
    png!.resolve('d1');
    assert.equal(png!.hash, 'd1');
    assert.throws(() => png!.resolve('d2'), /resolved twice/);
});

test('rule rejects paths, substitutions, missing extensions in outputs', () => {
    assert.throws(() => rule('a.png', ['c'], ['dir/x.png']), /nominal filenames/);
    assert.throws(() => rule('a.png', ['c'], ['%B.png']), /nominal filenames/);
    assert.throws(() => rule('a.png', ['c'], ['noext']), /needs an extension/);
});

test('rule validates command substitutions at declaration', () => {
    assert.throws(() => rule('a.png', ['tool %q'], ['x.png']), /Unknown substitution/);
    assert.throws(() => rule('a.png', ['tool %o2'], ['x.png']), /out of range/);
    assert.throws(() => rule('a.png', [''], ['x.png']), /no commands/);
});

test('forEachRule declares one rule per input, %b/%B templates', () => {
    const outs = forEachRule(['src/a.png', 'src/b.png'], ['convert %f %o'], '%B.gif');
    assert.deepEqual(outs.map(o => o.filename), ['a.gif', 'b.gif']);
    assert.notEqual(outs[0]!.decl, outs[1]!.decl);
    assert.throws(() => forEachRule('src/a.png', ['c'], '%f.gif'), /only use %b\/%B/);
});

test('chained rules accept artifacts as inputs', () => {
    const [png] = rule('src/a.png', ['tool %f %o'], ['x.png']);
    const [webp] = rule(png!, ['cwebp %f -o %o'], ['x.webp']);
    assert.equal(webp!.decl.inputs[0], png);
    assert.deepEqual(webp!.sources, []);
    png!.resolve('dp');
    const key = computeKey(webp!.decl, digests({}));
    assert.equal(typeof key, 'string');
});

test('key ignores input paths but not bytes, order, exts, or commands', () => {
    const [a] = rule('src/a.png', ['convert %f %o'], ['out.png']);
    const [b] = rule('src/elsewhere/z.png', ['convert %f %o'], ['other.png']);
    const kA = computeKey(a!.decl, digests({'src/a.png': 'd1'}));
    // Renamed source, same bytes, different nominal output: same key.
    assert.equal(kA, computeKey(b!.decl, digests({'src/elsewhere/z.png': 'd1'})));
    // Different bytes: different key.
    assert.notEqual(kA, computeKey(b!.decl, digests({'src/elsewhere/z.png': 'd2'})));

    const [two] = rule(['x.png', 'y.png'], ['join %f %o'], ['out.png']);
    const [reversed] = rule(['y.png', 'x.png'], ['join %f %o'], ['out.png']);
    const map = {'x.png': 'dx', 'y.png': 'dy'};
    assert.notEqual(computeKey(two!.decl, digests(map)), computeKey(reversed!.decl, digests(map)));

    const [gif] = rule('src/a.png', ['convert %f %o'], ['out.gif']);
    assert.notEqual(kA, computeKey(gif!.decl, digests({'src/a.png': 'd1'})));
});

test('nameSensitive keys on paths; rejects artifact inputs', () => {
    const spec = {nameSensitive: true, cmds: ['tool %f %o']};
    const [a] = rule('src/a.png', spec, ['out.png']);
    const [b] = rule('src/b.png', spec, ['out.png']);
    assert.notEqual(
        computeKey(a!.decl, digests({'src/a.png': 'd1'})),
        computeKey(b!.decl, digests({'src/b.png': 'd1'})));
    const [art] = rule('src/a.png', ['t %f %o'], ['x.png']);
    assert.throws(() => rule(art!, spec, ['y.png']), /not yet supported/);
});

test('deps are part of identity', () => {
    const [a] = rule('src/a.png', {deps: 'data/d.json', cmds: ['tool %f %o']}, ['out.png']);
    const kOld = computeKey(a!.decl, digests({'src/a.png': 'd1', 'data/d.json': 'j1'}));
    const kNew = computeKey(a!.decl, digests({'src/a.png': 'd1', 'data/d.json': 'j2'}));
    assert.notEqual(kOld, kNew);
});

test('memo runs once', () => {
    let calls = 0;
    const f = memo(() => { calls++; return rule('a.png', ['c %f %o'], ['x.png']); });
    assert.equal(f(), f());
    assert.equal(calls, 1);
});
