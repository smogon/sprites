
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as pathlib from 'node:path';
import {beforeEach, test} from 'node:test';

import b32encode from 'base32-encode';
import tar from 'tar-stream';

import {resetDecls, rule} from '../../build/artifact.ts';
import {casPath} from '../../build/cas.ts';
import {makeCtx} from '../api.ts';
import {ActionQueue} from '../queue.ts';

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

type PackedEntry = {name: string, data: string, type?: string, linkname?: string};

async function packedEntries(aq: ActionQueue, filter?: (dst: string) => boolean)
    : Promise<PackedEntry[]> {
    let packed = await aq.pack(filter);
    return new Promise((resolve, reject) => {
        let extract = tar.extract();
        let entries: PackedEntry[] = [];
        extract.on('entry', (header, stream, next) => {
            let chunks: Buffer[] = [];
            stream.on('data', c => chunks.push(c));
            stream.on('end', () => {
                let entry: PackedEntry = {name: header.name, data: Buffer.concat(chunks).toString()};
                if (header.type === 'symlink') {
                    entry.type = header.type;
                    entry.linkname = header.linkname ?? undefined;
                }
                entries.push(entry);
                next();
            });
        });
        extract.on('finish', () => resolve(entries));
        extract.on('error', reject);
        packed.pipe(extract);
    });
}

test('pack preserves op order', async () => {
    let aq = new ActionQueue();
    aq.write('zzz', 'z.txt');
    aq.write('aaa', 'a.txt');
    assert.deepEqual(await packedEntries(aq), [
        {name: 'z.txt', data: 'zzz'},
        {name: 'a.txt', data: 'aaa'},
    ]);
});

test('pack with a filter packs only matching entries in order', async () => {
    let aq = new ActionQueue();
    aq.write('1', 'xy/a.png');
    aq.write('2', 'meta/m.json');
    aq.write('3', 'xy/b.png');
    let subset = await packedEntries(aq, dst => dst.startsWith('xy/'));
    assert.deepEqual(subset, [
        {name: 'xy/a.png', data: '1'},
        {name: 'xy/b.png', data: '3'},
    ]);
});

test('duplicate and absolute destinations invalidate the queue', async () => {
    let dup = new ActionQueue();
    dup.write('a', 'x.txt');
    dup.write('b', 'x.txt');
    assert.ok(!dup.valid);
    await assert.rejects(() => dup.pack(), /Invalid ActionQueue/);

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

test('pack carries a symlink as a link, not the bytes it names', async () => {
    let aq = new ActionQueue();
    aq.write('1', 'links/xy/a-XXXX.gif');
    aq.symlink('a-XXXX.gif', 'links/xy/a.gif');
    assert.deepEqual(await packedEntries(aq), [
        {name: 'links/xy/a-XXXX.gif', data: '1'},
        {name: 'links/xy/a.gif', data: '', type: 'symlink', linkname: 'a-XXXX.gif'},
    ]);
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
