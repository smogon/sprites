
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import pathlib from 'node:path';
import {beforeEach, test} from 'node:test';

import b32encode from 'base32-encode';
import tar from 'tar-stream';

import {resetDecls, rule} from '../../build/artifact.ts';
import {casPath} from '../../build/cas.ts';
import {makeCtx} from '../api.ts';
import {ActionQueue} from '../queue.ts';

beforeEach(resetDecls);

function tmpdir() : string {
    return fs.mkdtempSync(pathlib.join(os.tmpdir(), 'deploy-api-test-'));
}

function shortHash(data : Buffer | string) : string {
    return b32encode(createHash('sha256').update(data).digest(), 'RFC4648').slice(0, 8);
}

// Stage `content` as a built artifact in a scratch CAS.
function makeArtifact(casDir : string, content : string, ext : string) {
    const digest = createHash('sha256').update(content).digest('hex');
    const artifact = rule('in.png', ['t %f %o'], `art.${ext}`);
    artifact.resolve(digest);
    const obj = casPath(casDir, digest, ext);
    fs.mkdirSync(pathlib.dirname(obj), {recursive: true});
    fs.writeFileSync(obj, content);
    return artifact;
}

test('ctx.hash matches the historical single-file stamp for artifacts and files', () => {
    const dir = tmpdir();
    const file = pathlib.join(dir, 'f.png');
    fs.writeFileSync(file, 'stamp-me');
    const artifact = makeArtifact(pathlib.join(dir, 'cas'), 'stamp-me', 'png');
    const ctx = makeCtx(pathlib.join(dir, 'cas'), new ActionQueue());
    assert.equal(ctx.hash(file), shortHash('stamp-me'));
    assert.equal(ctx.hash(artifact), shortHash('stamp-me'));
});

test('multi-source ctx.hash is order-insensitive and content-sensitive', () => {
    const dir = tmpdir();
    const a = pathlib.join(dir, 'a.png');
    const b = pathlib.join(dir, 'b.png');
    fs.writeFileSync(a, 'aaa');
    fs.writeFileSync(b, 'bbb');
    const ctx = makeCtx(pathlib.join(dir, 'cas'), new ActionQueue());
    const before = ctx.hash(a, b);
    assert.equal(before, ctx.hash(b, a));
    assert.notEqual(before, ctx.hash(a));
    fs.writeFileSync(b, 'changed');
    assert.notEqual(ctx.hash(a, b), before);
});

test('ctx queues artifact copies from the CAS, writes and reads', () => {
    const dir = tmpdir();
    const casDir = pathlib.join(dir, 'cas');
    const artifact = makeArtifact(casDir, 'bytes', 'webp');
    const aq = new ActionQueue();
    const ctx = makeCtx(casDir, aq);
    ctx.write('__key', 'sprites');
    ctx.copy(artifact, 'sprites/x.webp');
    assert.equal(ctx.read(artifact), 'bytes');
    const ops = aq.log.filter(e => e.type === 'Op');
    assert.deepEqual(ops.map(e => e.dst), ['__key', 'sprites/x.webp']);
    assert.equal((ops[1] as {op : {src : string}}).op.src, casPath(casDir, artifact.hash, 'webp'));
});

test('ctx.list sorts, parses extensions, skips dotfiles and directories', () => {
    const dir = tmpdir();
    fs.writeFileSync(pathlib.join(dir, 'b.png'), '');
    fs.writeFileSync(pathlib.join(dir, 'a.gif'), '');
    fs.writeFileSync(pathlib.join(dir, 'noext'), '');
    fs.writeFileSync(pathlib.join(dir, '.hidden'), '');
    fs.mkdirSync(pathlib.join(dir, 'subdir'));
    const ctx = makeCtx('cas', new ActionQueue());
    assert.deepEqual(ctx.list(dir), [
        {dir, name: 'a', ext: 'gif', path: pathlib.join(dir, 'a.gif')},
        {dir, name: 'b', ext: 'png', path: pathlib.join(dir, 'b.png')},
        {dir, name: 'noext', ext: null, path: pathlib.join(dir, 'noext')},
    ]);
});

function packedEntries(aq : ActionQueue) : Promise<{name : string, data : string}[]> {
    return new Promise((resolve, reject) => {
        const extract = tar.extract();
        const entries : {name : string, data : string}[] = [];
        extract.on('entry', (header, stream, next) => {
            const chunks : Buffer[] = [];
            stream.on('data', c => chunks.push(c));
            stream.on('end', () => {
                entries.push({name: header.name, data: Buffer.concat(chunks).toString()});
                next();
            });
        });
        extract.on('finish', () => resolve(entries));
        extract.on('error', reject);
        aq.pack().pipe(extract);
    });
}

test('pack preserves op order with __key first', async () => {
    const aq = new ActionQueue();
    aq.write('sprites', '__key');
    aq.write('zzz', 'z.txt');
    aq.write('aaa', 'a.txt');
    assert.deepEqual(await packedEntries(aq), [
        {name: '__key', data: 'sprites'},
        {name: 'z.txt', data: 'zzz'},
        {name: 'a.txt', data: 'aaa'},
    ]);
});

test('duplicate and absolute destinations invalidate the queue', () => {
    const dup = new ActionQueue();
    dup.write('a', 'x.txt');
    dup.write('b', 'x.txt');
    assert.ok(!dup.valid);
    assert.throws(() => dup.pack(), /Invalid ActionQueue/);

    const abs = new ActionQueue();
    abs.write('a', '/etc/passwd');
    assert.ok(!abs.valid);
});

test('copy-mode materialization restores 0644 on read-only sources', async () => {
    const dir = tmpdir();
    const src = pathlib.join(dir, 'obj');
    fs.writeFileSync(src, 'x');
    fs.chmodSync(src, 0o444);
    const aq = new ActionQueue();
    aq.copy(src, 'out/x.png');
    const out = pathlib.join(dir, 'deploy');
    await aq.run(out, 'copy');
    assert.equal(fs.statSync(pathlib.join(out, 'out/x.png')).mode & 0o777, 0o644);
});
