
import assert from 'node:assert/strict';
import {beforeEach, test} from 'node:test';

import {computeKey, forEachRule, getDecls, resetDecls, rule} from '../artifact.ts';

beforeEach(resetDecls);

function digests(map: Record<string, string>): (path: string) => string {
    return path => {
        let d = map[path];
        assert.ok(d !== undefined, `no digest for ${path}`);
        return d;
    };
}

test('rule declares artifacts with nominal names', () => {
    let [png, css] = rule('src/a.png', ['tool %f %o1 %o2'], ['sheet.png', 'sheet.css']);
    assert.equal(png.name, 'sheet');
    assert.equal(png.ext, 'png');
    assert.equal(css.filename, 'sheet.css');
    assert.equal(png.decl, css.decl);
    assert.throws(() => png.hash, /not been built/);
    png.resolve('d1');
    assert.equal(png.hash, 'd1');
    assert.throws(() => png.resolve('d2'), /resolved twice/);
});

test('a single string output returns its artifact directly', () => {
    let out = rule('src/a.png', ['tool %f %o'], 'only.png');
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
    let out = rule('src/dir/a.png', ['emit --name %B %f %o'], 'x.css');
    // Expanded eagerly, and thus part of the key: same bytes under a
    // different name is a different rule once %B is in the command.
    assert.deepEqual(out.decl.cmds, ['emit --name a %f %o']);
    let out2 = rule('src/dir/b.png', ['emit --name %B %f %o'], 'x.css');
    assert.notEqual(
        computeKey(out.decl, digests({'src/dir/a.png': 'd1'})),
        computeKey(out2.decl, digests({'src/dir/b.png': 'd1'})));
});

test('a multi-line command and split commands get different keys', () => {
    let a = rule('a.png', ['one\ntwo'], 'x.png');
    let b = rule('a.png', ['one', 'two'], 'x.png');
    let map = {'a.png': 'd1'};
    assert.notEqual(computeKey(a.decl, digests(map)), computeKey(b.decl, digests(map)));
});

test('rule validates command substitutions at declaration', () => {
    assert.throws(() => rule('a.png', ['tool %q'], 'x.png'), /Unknown substitution/);
    assert.throws(() => rule('a.png', ['tool %o2'], 'x.png'), /out of range/);
    assert.throws(() => rule('a.png', [''], 'x.png'), /no commands/);
});

test('forEachRule declares one rule per input, %b/%B templates', () => {
    let outs = forEachRule(['src/a.png', 'src/b.png'], ['convert %f %o'], '%B.gif');
    assert.deepEqual(outs.map(o => o.filename), ['a.gif', 'b.gif']);
    assert.notEqual(outs[0]!.decl, outs[1]!.decl);
    assert.throws(() => forEachRule('src/a.png', ['c'], '%f.gif'), /only use %b\/%B/);
});

test('key ignores input paths but not bytes, order, exts, or commands', () => {
    let a = rule('src/a.png', ['convert %f %o'], 'out.png');
    let b = rule('src/elsewhere/z.png', ['convert %f %o'], 'other.png');
    let kA = computeKey(a.decl, digests({'src/a.png': 'd1'}));
    // Renamed source, same bytes, different nominal output: same key.
    assert.equal(kA, computeKey(b.decl, digests({'src/elsewhere/z.png': 'd1'})));
    // Different bytes: different key.
    assert.notEqual(kA, computeKey(b.decl, digests({'src/elsewhere/z.png': 'd2'})));

    let two = rule(['x.png', 'y.png'], ['join %f %o'], 'out.png');
    let reversed = rule(['y.png', 'x.png'], ['join %f %o'], 'out.png');
    let map = {'x.png': 'dx', 'y.png': 'dy'};
    assert.notEqual(computeKey(two.decl, digests(map)), computeKey(reversed.decl, digests(map)));

    let gif = rule('src/a.png', ['convert %f %o'], 'out.gif');
    assert.notEqual(kA, computeKey(gif.decl, digests({'src/a.png': 'd1'})));
});

test('nameSensitive keys on paths; rejects artifact inputs', () => {
    let spec = {nameSensitive: true, cmds: ['tool %f %o']};
    let a = rule('src/a.png', spec, 'out.png');
    let b = rule('src/b.png', spec, 'out.png');
    assert.notEqual(
        computeKey(a.decl, digests({'src/a.png': 'd1'})),
        computeKey(b.decl, digests({'src/b.png': 'd1'})));
});

test('deps are part of identity', () => {
    let a = rule('src/a.png', {deps: 'data/d.json', cmds: ['tool %f %o']}, 'out.png');
    let kOld = computeKey(a.decl, digests({'src/a.png': 'd1', 'data/d.json': 'j1'}));
    let kNew = computeKey(a.decl, digests({'src/a.png': 'd1', 'data/d.json': 'j2'}));
    assert.notEqual(kOld, kNew);
});

test('identical declarations return the existing artifacts', () => {
    let first = rule('a.png', ['c %f %o'], 'x.png');
    let second = rule('a.png', ['c %f %o'], 'x.png');
    assert.equal(first, second);
    assert.equal(getDecls().length, 1);
});

test('forEachRule dedupes per input, sharing overlap', () => {
    let spec = {display: 'd %f', cmds: ['c %f %o']};
    let first = forEachRule(['src/a.png', 'src/b.png'], spec, '%B.gif');
    let second = forEachRule(['src/b.png', 'src/c.png'], spec, '%B.gif');
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
