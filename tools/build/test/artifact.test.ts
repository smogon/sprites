
import assert from 'node:assert/strict';
import {beforeEach, test} from 'node:test';

import {type Input, computeKey, forEachRule, getDecls, resetDecls, rule} from '../artifact.ts';

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
    assert.equal(png.name, 'sheet');
    assert.equal(png.ext, 'png');
    assert.equal(css.filename, 'sheet.css');
    assert.deepEqual(png.sources, ['src/a.png']);
    assert.equal(png.decl, css.decl);
    assert.throws(() => png.hash, /not been built/);
    png.resolve('d1');
    assert.equal(png.hash, 'd1');
    assert.throws(() => png.resolve('d2'), /resolved twice/);
});

test('a single string output returns its artifact directly', () => {
    const out = rule('src/a.png', ['tool %f %o'], 'only.png');
    assert.equal(out.filename, 'only.png');
});

test('rule rejects paths, substitutions, missing extensions in outputs', () => {
    assert.throws(() => rule('a.png', ['c'], ['dir/x.png']), /nominal filenames/);
    assert.throws(() => rule('a.png', ['c'], ['%B.png']), /nominal filenames/);
    assert.throws(() => rule('a.png', ['c'], ['noext']), /needs an extension/);
    assert.throws(() => rule('a.png', ['c'], []), /no outputs/);
    assert.throws(() => rule('a.png', ['c'], ['has space.png']), /shell-hostile/);
    assert.throws(() => rule('a.png', ['c'], ['quote"d.png']), /shell-hostile/);
});

test('%b/%B in commands expand to nominal names at declaration', () => {
    const art = rule('src/dir/a.png', ['tool %f %o'], 'mid.png');
    const out = rule(art, ['emit --name %B %f %o'], 'x.css');
    // Expanded eagerly (never a CAS basename), and thus part of the key.
    assert.deepEqual(out.decl.cmds, ['emit --name mid %f %o']);
    art.resolve('d1');
    const renamed = rule('src/dir/b.png', ['tool %f %o'], 'other.png');
    const out2 = rule(renamed, ['emit --name %B %f %o'], 'x.css');
    renamed.resolve('d1');
    assert.notEqual(
        computeKey(out.decl, digests({})),
        computeKey(out2.decl, digests({})));
});

test('a multi-line command and split commands get different keys', () => {
    const a = rule('a.png', ['one\ntwo'], 'x.png');
    const b = rule('a.png', ['one', 'two'], 'x.png');
    const map = {'a.png': 'd1'};
    assert.notEqual(computeKey(a.decl, digests(map)), computeKey(b.decl, digests(map)));
});

test('rule validates command substitutions at declaration', () => {
    assert.throws(() => rule('a.png', ['tool %q'], 'x.png'), /Unknown substitution/);
    assert.throws(() => rule('a.png', ['tool %o2'], 'x.png'), /out of range/);
    assert.throws(() => rule('a.png', [''], 'x.png'), /no commands/);
});

test('forEachRule declares one rule per input, %b/%B templates', () => {
    const outs = forEachRule(['src/a.png', 'src/b.png'], ['convert %f %o'], '%B.gif');
    assert.deepEqual(outs.map(o => o.filename), ['a.gif', 'b.gif']);
    assert.notEqual(outs[0]!.decl, outs[1]!.decl);
    assert.throws(() => forEachRule('src/a.png', ['c'], '%f.gif'), /only use %b\/%B/);
});

test('chained rules accept artifacts as inputs', () => {
    const png = rule('src/a.png', ['tool %f %o'], 'x.png');
    const webp = rule(png, ['cwebp %f -o %o'], 'x.webp');
    assert.equal(webp.decl.inputs[0], png);
    assert.deepEqual(webp.sources, []);
    png.resolve('dp');
    const key = computeKey(webp.decl, digests({}));
    assert.equal(typeof key, 'string');
});

test('key ignores input paths but not bytes, order, exts, or commands', () => {
    const a = rule('src/a.png', ['convert %f %o'], 'out.png');
    const b = rule('src/elsewhere/z.png', ['convert %f %o'], 'other.png');
    const kA = computeKey(a.decl, digests({'src/a.png': 'd1'}));
    // Renamed source, same bytes, different nominal output: same key.
    assert.equal(kA, computeKey(b.decl, digests({'src/elsewhere/z.png': 'd1'})));
    // Different bytes: different key.
    assert.notEqual(kA, computeKey(b.decl, digests({'src/elsewhere/z.png': 'd2'})));

    const two = rule(['x.png', 'y.png'], ['join %f %o'], 'out.png');
    const reversed = rule(['y.png', 'x.png'], ['join %f %o'], 'out.png');
    const map = {'x.png': 'dx', 'y.png': 'dy'};
    assert.notEqual(computeKey(two.decl, digests(map)), computeKey(reversed.decl, digests(map)));

    const gif = rule('src/a.png', ['convert %f %o'], 'out.gif');
    assert.notEqual(kA, computeKey(gif.decl, digests({'src/a.png': 'd1'})));
});

test('nameSensitive keys on paths; rejects artifact inputs', () => {
    const spec = {nameSensitive: true, cmds: ['tool %f %o']};
    const a = rule('src/a.png', spec, 'out.png');
    const b = rule('src/b.png', spec, 'out.png');
    assert.notEqual(
        computeKey(a.decl, digests({'src/a.png': 'd1'})),
        computeKey(b.decl, digests({'src/b.png': 'd1'})));
    const art = rule('src/a.png', ['t %f %o'], 'x.png');
    assert.throws(() => rule(art, spec, 'y.png'), /not yet supported/);
});

test('deps are part of identity', () => {
    const a = rule('src/a.png', {deps: 'data/d.json', cmds: ['tool %f %o']}, 'out.png');
    const kOld = computeKey(a.decl, digests({'src/a.png': 'd1', 'data/d.json': 'j1'}));
    const kNew = computeKey(a.decl, digests({'src/a.png': 'd1', 'data/d.json': 'j2'}));
    assert.notEqual(kOld, kNew);
});

test('identical declarations return the existing artifacts', () => {
    const first = rule('a.png', ['c %f %o'], 'x.png');
    const second = rule('a.png', ['c %f %o'], 'x.png');
    assert.equal(first, second);
    assert.equal(getDecls().length, 1);
});

test('forEachRule dedupes per input, sharing overlap', () => {
    const spec = {display: 'd %f', cmds: ['c %f %o']};
    const first = forEachRule(['src/a.png', 'src/b.png'], spec, '%B.gif');
    const second = forEachRule(['src/b.png', 'src/c.png'], spec, '%B.gif');
    assert.equal(first[1], second[0]);
    assert.equal(getDecls().length, 3);
});

test('declarations differing in display, cmds, or outputs stay distinct', () => {
    rule('a.png', {display: 'one', cmds: ['c %f %o']}, 'x.png');
    rule('a.png', {display: 'two', cmds: ['c %f %o']}, 'x.png');
    rule('a.png', {display: 'one', cmds: ['other %f %o']}, 'x.png');
    rule('a.png', {display: 'one', cmds: ['c %f %o']}, 'y.png');
    assert.equal(getDecls().length, 4);
});

test('chained declarations dedupe through artifact inputs', () => {
    const mid = rule('a.png', ['c %f %o'], 'mid.png');
    const first = rule(mid, ['convert %f %o'], 'out.webp');
    const second = rule(mid, ['convert %f %o'], 'out.webp');
    assert.equal(first, second);
    assert.equal(getDecls().length, 2);
});
