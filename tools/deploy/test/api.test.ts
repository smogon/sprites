
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as pathlib from 'node:path';
import {beforeEach, test} from 'node:test';

import b32encode from 'base32-encode';

import {resetDecls, rule} from '../../build/artifact.ts';
import {casPath} from '../../build/cas.ts';
import {makeCtx} from '../api.ts';
import {ActionQueue} from '../queue.ts';
import {BuildError} from '../../build/errors.ts';

beforeEach(resetDecls);

function tmpdir(): string {
    return fs.mkdtempSync(pathlib.join(os.tmpdir(), 'deploy-api-test-'));
}

function shortHash(data: Buffer | string): string {
    return b32encode(createHash('sha256').update(data).digest(), 'RFC4648').slice(0, 8);
}

// Stage `content` as a built artifact in a scratch CAS.
function makeArtifact(casDir: string, content: string, ext: string) {
    let digest = createHash('sha256').update(content).digest('hex');
    let artifact = rule('in.png', ['t %f %o'], `art.${ext}`);
    artifact.resolve(digest);
    let obj = casPath(casDir, digest, ext);
    fs.mkdirSync(pathlib.dirname(obj), {recursive: true});
    fs.writeFileSync(obj, content);
    fs.chmodSync(obj, 0o444);
    return artifact;
}

test('ctx.hash matches the historical single-file stamp for artifacts and files', async () => {
    let dir = tmpdir();
    let file = pathlib.join(dir, 'f.png');
    fs.writeFileSync(file, 'stamp-me');
    let artifact = makeArtifact(pathlib.join(dir, 'cas'), 'stamp-me', 'png');
    let ctx = makeCtx(pathlib.join(dir, 'cas'), new ActionQueue());
    assert.equal(await ctx.hash(file), shortHash('stamp-me'));
    assert.equal(await ctx.hash(artifact), shortHash('stamp-me'));
});

test('multi-source ctx.hash is order-insensitive and content-sensitive', async () => {
    let dir = tmpdir();
    let a = pathlib.join(dir, 'a.png');
    let b = pathlib.join(dir, 'b.png');
    fs.writeFileSync(a, 'aaa');
    fs.writeFileSync(b, 'bbb');
    let ctx = makeCtx(pathlib.join(dir, 'cas'), new ActionQueue());
    let before = await ctx.hash(a, b);
    assert.equal(before, await ctx.hash(b, a));
    assert.notEqual(before, await ctx.hash(a));
    fs.writeFileSync(b, 'changed');
    assert.notEqual(await ctx.hash(a, b), before);
});

test('ctx queues artifact copies from the CAS, writes and reads', async () => {
    let dir = tmpdir();
    let casDir = pathlib.join(dir, 'cas');
    let artifact = makeArtifact(casDir, 'bytes', 'webp');
    let aq = new ActionQueue();
    let ctx = makeCtx(casDir, aq);
    ctx.write('m.json', '{}');
    ctx.copy(artifact, 'sprites/x.webp');
    assert.equal(await ctx.read(artifact), 'bytes');
    let ops = aq.log.filter(e => e.type === 'Op');
    assert.deepEqual(ops.map(e => e.dst), ['m.json', 'sprites/x.webp']);
    assert.equal((ops[1] as {op: {src: string}}).op.src, casPath(casDir, artifact.hash, 'webp'));
});

test('ctx.list sorts, parses extensions, skips dotfiles and directories', async () => {
    let dir = tmpdir();
    fs.writeFileSync(pathlib.join(dir, 'b.png'), '');
    fs.writeFileSync(pathlib.join(dir, 'a.gif'), '');
    fs.writeFileSync(pathlib.join(dir, 'noext'), '');
    fs.writeFileSync(pathlib.join(dir, '.hidden'), '');
    fs.mkdirSync(pathlib.join(dir, 'subdir'));
    let ctx = makeCtx('cas', new ActionQueue());
    assert.deepEqual(await ctx.list(dir), [
        {dir, name: 'a', ext: 'gif', path: pathlib.join(dir, 'a.gif')},
        {dir, name: 'b', ext: 'png', path: pathlib.join(dir, 'b.png')},
        {dir, name: 'noext', ext: null, path: pathlib.join(dir, 'noext')},
    ]);
});

test('duplicate and absolute destinations invalidate the queue', async () => {
    let dup = new ActionQueue();
    dup.write('a', 'x.txt');
    dup.write('b', 'x.txt');
    assert.ok(!dup.valid);
    await assert.rejects(() => dup.run(tmpdir(), 'copy'), /Invalid ActionQueue/);

    let up = new ActionQueue();
    up.write('a', 'x/../../y.txt');
    assert.ok(!up.valid);

    let abs = new ActionQueue();
    abs.write('a', '/etc/passwd');
    assert.ok(!abs.valid);
});

test('run with a filter materializes only matching entries', async () => {
    let dir = tmpdir();
    let aq = new ActionQueue();
    aq.write('1', 'ani/a.gif');
    aq.write('2', 'dex/b.png');
    let out = pathlib.join(dir, 'deploy');
    await aq.run(out, 'copy', dst => dst.startsWith('ani/'));
    assert.equal(fs.readFileSync(pathlib.join(out, 'ani/a.gif'), 'utf8'), '1');
    assert.ok(!fs.existsSync(pathlib.join(out, 'dex')));
});

test('copy-mode materialization restores 0644 on read-only sources', async () => {
    let dir = tmpdir();
    let src = pathlib.join(dir, 'obj');
    fs.writeFileSync(src, 'x');
    fs.chmodSync(src, 0o444);
    let aq = new ActionQueue();
    aq.copy(src, 'out/x.png');
    let out = pathlib.join(dir, 'deploy');
    await aq.run(out, 'copy');
    assert.equal(fs.statSync(pathlib.join(out, 'out/x.png')).mode & 0o777, 0o644);
});

test('run materializes a symlink resolving beside its target', async () => {
    let dir = tmpdir();
    let aq = new ActionQueue();
    aq.write('bytes', 'xy/a-XXXX.gif');
    aq.symlink('a-XXXX.gif', 'xy/a.gif');
    let out = pathlib.join(dir, 'deploy');
    await aq.run(out, 'copy');
    let link = pathlib.join(out, 'xy/a.gif');
    assert.ok(fs.lstatSync(link).isSymbolicLink());
    assert.equal(fs.readlinkSync(link), 'a-XXXX.gif');
    assert.equal(fs.readFileSync(link, 'utf8'), 'bytes');
    // A second pass over the same tree is what a rerun looks like
    await aq.run(out, 'copy');
    assert.equal(fs.readlinkSync(link), 'a-XXXX.gif');
});

test('a symlink target naming anything outside the tree invalidates the queue', async () => {
    let escaping = new ActionQueue();
    escaping.symlink('../../etc/passwd', 'xy/a.gif');
    assert.ok(!escaping.valid);

    let absolute = new ActionQueue();
    absolute.symlink('/etc/passwd', 'xy/a.gif');
    assert.ok(!absolute.valid);

    let tree = new ActionQueue();
    tree.symlink('..', 'xy/a.gif');
    assert.ok(!tree.valid);

    // A target that walks up and back down again stays in the tree, which is
    // what a link between two of its subtrees looks like.
    let across = new ActionQueue();
    across.symlink('../sprites/a-XXXX.gif', '__meta/a.gif');
    across.symlink('a-XXXX.gif', 'xy/a.gif');
    assert.ok(across.valid);
});

test('ctx.symlink writes the path from the link to what it names', async () => {
    let aq = new ActionQueue();
    let ctx = makeCtx('cas', aq);
    ctx.symlink('__meta/links/sprites/xy/a.gif', 'sprites/xy/a-XXXX.gif');
    ctx.symlink('__meta/a.gif', 'sprites/a-XXXX.gif');
    let ops = aq.log.filter(e => e.type === 'Op');
    assert.ok(aq.valid);
    assert.deepEqual(ops.map(e => (e.op as {target: string}).target), [
        '../../../../sprites/xy/a-XXXX.gif',
        '../sprites/a-XXXX.gif',
    ]);
});

// A tree and a meta directory under one scratch root, with a CAS beside them.
function publishDirs() {
    let dir = tmpdir();
    return {dir, tree: pathlib.join(dir, 'tree'), meta: pathlib.join(dir, 'meta'), cas: pathlib.join(dir, 'cas')};
}

test('publish places the tree, retargets links into it and records what it stands behind', async () => {
    let {dir, tree, meta, cas} = publishDirs();
    let art = makeArtifact(cas, 'gif bytes', 'gif');
    let src = pathlib.join(dir, 'src.png');
    fs.writeFileSync(src, 'png bytes');
    let aq = new ActionQueue();
    let ctx = makeCtx(cas, aq);
    ctx.copy(art, 'xy/a-HASH.gif');
    ctx.copy(src, 'xy/b-HASH.png');
    ctx.write('spritesheet-HASH.css', 'css');
    ctx.write('__meta/xy/manifest.json', '{}');
    ctx.symlink('__meta/links/xy/a.gif', 'xy/a-HASH.gif');
    ctx.symlink('__meta/other.json', '__meta/xy/manifest.json');
    assert.deepEqual(await aq.publish(tree, meta, 'd1g3st'), {files: 3, placed: 3, kept: 0});

    // The CAS object is shared, the source is copied, the write is a file
    assert.equal(fs.statSync(pathlib.join(tree, 'xy/a-HASH.gif')).ino, fs.statSync(casPath(cas, art.hash, 'gif')).ino);
    assert.notEqual(fs.statSync(pathlib.join(tree, 'xy/b-HASH.png')).ino, fs.statSync(src).ino);
    assert.equal(fs.statSync(pathlib.join(tree, 'xy/b-HASH.png')).mode & 0o777, 0o644);
    assert.equal(fs.readFileSync(pathlib.join(tree, 'spritesheet-HASH.css'), 'utf8'), 'css');
    assert.equal(fs.readFileSync(pathlib.join(meta, 'xy/manifest.json'), 'utf8'), '{}');
    // Both ends landed apart; the link follows the file into the tree
    let link = pathlib.join(meta, 'links/xy/a.gif');
    assert.equal(fs.readlinkSync(link), '../../../tree/xy/a-HASH.gif');
    assert.equal(fs.readFileSync(link, 'utf8'), 'gif bytes');
    assert.equal(fs.readFileSync(pathlib.join(meta, 'other.json'), 'utf8'), '{}');
    assert.equal(fs.readFileSync(pathlib.join(meta, '__files'), 'utf8'),
        'spritesheet-HASH.css\nxy/a-HASH.gif\nxy/b-HASH.png\n');
    assert.equal(fs.readFileSync(pathlib.join(meta, '__digest'), 'utf8'), 'd1g3st\n');
    assert.ok(!fs.readdirSync(pathlib.join(tree, 'xy')).some(name => name.startsWith('.')), 'no temp files left');
});

test('publish keeps what the tree has and refuses a name holding something else', async () => {
    let {tree, meta, cas} = publishDirs();
    fs.mkdirSync(pathlib.join(tree, 'xy'), {recursive: true});
    fs.writeFileSync(pathlib.join(tree, 'xy/a-HASH.gif'), 'same size');
    let old = new Date(2020, 0, 1);
    fs.utimesSync(pathlib.join(tree, 'xy/a-HASH.gif'), old, old);
    let aq = new ActionQueue();
    aq.write('SAME SIZE', 'xy/a-HASH.gif');
    assert.deepEqual(await aq.publish(tree, meta, 'd'), {files: 1, placed: 0, kept: 1});
    assert.equal(fs.readFileSync(pathlib.join(tree, 'xy/a-HASH.gif'), 'utf8'), 'same size', 'not rewritten');
    assert.ok(fs.statSync(pathlib.join(tree, 'xy/a-HASH.gif')).mtime > old, 'touched');

    let other = new ActionQueue();
    other.write('a different length', 'xy/a-HASH.gif');
    await assert.rejects(() => other.publish(tree, pathlib.join(meta, '2'), 'd'), /Different file size/);
    void cas;
});

test('publish refuses links in the tree, links to what it does not carry, and __ meta names', async () => {
    let {tree, meta} = publishDirs();
    let inTree = new ActionQueue();
    inTree.write('a', 'xy/a-HASH.gif');
    inTree.symlink('a-HASH.gif', 'xy/a.gif');
    await assert.rejects(() => inTree.publish(tree, meta, 'd'), BuildError);

    let dangling = new ActionQueue();
    dangling.symlink('../../xy/a-HASH.gif', '__meta/links/xy/a.gif');
    await assert.rejects(() => dangling.publish(tree, meta, 'd'), /doesn't carry/);

    let reserved = new ActionQueue();
    reserved.write('a', '__meta/__files');
    await assert.rejects(() => reserved.publish(tree, meta, 'd'), /publish's own/);
});
