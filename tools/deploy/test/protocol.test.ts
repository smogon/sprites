import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as pathlib from 'node:path';
import {test} from 'node:test';

import {MAGIC, Reply, manifestOf, negotiate, type Manifest} from '../protocol.ts';
import {ActionQueue} from '../queue.ts';

let here = pathlib.dirname(new URL(import.meta.url).pathname);
let TIMEOUT = 10_000;

function tmpdir(): string {
    return fs.mkdtempSync(pathlib.join(os.tmpdir(), 'deploy-protocol-test-'));
}

// A queue shaped like a small deploy: two stamped assets, one of them named
// awkwardly, a manifest under __meta/ and a link mirroring an asset.
async function sampleQueue(dir: string): Promise<{aq: ActionQueue, manifest: Manifest}> {
    let aq = new ActionQueue();
    let src = pathlib.join(dir, 'a.gif');
    fs.writeFileSync(src, 'gif bytes');
    aq.copy(src, 'sprites/xy/a-HASH.gif');
    aq.write('héllo', 'sprites/xy/b c\td-HASH.txt');
    aq.write('{}', '__meta/xy/manifest.json');
    aq.symlink('../../sprites/xy/a-HASH.gif', '__meta/links/xy/a.gif');
    return {aq, manifest: await manifestOf(aq)};
}

function u32(n: number): Buffer {
    let b = Buffer.alloc(4);
    b.writeUInt32BE(n);
    return b;
}

function reply(indices: number[], version = 1): Buffer {
    return Buffer.concat([MAGIC, u32(version), u32(indices.length), ...indices.map(u32)]);
}

test('manifestOf spells the wire format, in queue order, sizes as the tar would carry them', async () => {
    let {manifest} = await sampleQueue(tmpdir());
    assert.deepEqual(manifest.entries,
        ['sprites/xy/a-HASH.gif', 'sprites/xy/b c\td-HASH.txt', '__meta/xy/manifest.json', '__meta/links/xy/a.gif']);
    assert.deepEqual([...manifest.assets], [0, 1]);
    assert.deepEqual([...manifest.metaFiles], ['__meta/xy/manifest.json']);

    let b = manifest.bytes;
    assert.ok(b.subarray(0, 16).equals(MAGIC));
    assert.equal(b.readUInt32BE(16), 1, 'version');
    assert.equal(b.readUInt32BE(20), 4, 'count');
    let at = 24;
    let expectFile = (kind: number, size: number, name: string) => {
        assert.equal(b[at], kind, `kind of ${name}`);
        assert.equal(Number(b.readBigUInt64BE(at + 1)), size, `size of ${name}`);
        let raw = Buffer.from(name);
        assert.equal(b.readUInt32BE(at + 9), raw.length, `name length of ${name}`);
        assert.ok(b.subarray(at + 13, at + 13 + raw.length).equals(raw), `name of ${name}`);
        at += 13 + raw.length;
    };
    expectFile(1, 'gif bytes'.length, 'sprites/xy/a-HASH.gif');
    // Six characters, seven bytes: the size is the utf-8's, since that is what
    // tar-stream writes, and the tab rides inside the length-prefixed name.
    expectFile(1, 6, 'sprites/xy/b c\td-HASH.txt');
    expectFile(2, 2, '__meta/xy/manifest.json');
    assert.equal(b[at], 3, 'a link');
    let name = Buffer.from('__meta/links/xy/a.gif');
    let target = Buffer.from('../../sprites/xy/a-HASH.gif');
    assert.equal(b.readUInt32BE(at + 1), name.length);
    assert.ok(b.subarray(at + 5, at + 5 + name.length).equals(name));
    at += 5 + name.length;
    assert.equal(b.readUInt32BE(at), target.length);
    assert.ok(b.subarray(at + 4, at + 4 + target.length).equals(target));
    assert.equal(at + 4 + target.length, b.length, 'nothing after the last entry');
});

test('manifestOf takes only what the filter selects, positions renumbered', async () => {
    let {aq} = await sampleQueue(tmpdir());
    let manifest = await manifestOf(aq, dst => dst.startsWith('__meta/'));
    assert.deepEqual(manifest.entries, ['__meta/xy/manifest.json', '__meta/links/xy/a.gif']);
    assert.equal(manifest.assets.size, 0);
    assert.equal(manifest.bytes.readUInt32BE(20), 2);
});

test('Reply reads a reply however it is chunked and relays the report after it', async () => {
    let {manifest} = await sampleQueue(tmpdir());
    let bytes = Buffer.concat([reply([1, 0]), Buffer.from('* 2 files\n')]);
    for (let step of [bytes.length, 1, 7]) {
        let relayed: Buffer[] = [];
        let r = new Reply(manifest, chunk => relayed.push(chunk));
        for (let i = 0; i < bytes.length; i += step) {
            r.feed(bytes.subarray(i, i + step));
        }
        assert.equal(r.outcome, 'ok', `chunked by ${step}`);
        assert.deepEqual([...r.wanted].sort(), ['sprites/xy/a-HASH.gif', 'sprites/xy/b c\td-HASH.txt']);
        assert.equal(Buffer.concat(relayed).toString(), '* 2 files\n', `report chunked by ${step}`);
    }
});

test('Reply refuses anything that is not a reply, and relays it whole', async () => {
    let {manifest} = await sampleQueue(tmpdir());

    // Text where the magic should be: a refusal, a shell profile, a filter
    let relayed: Buffer[] = [];
    let r = new Reply(manifest, chunk => relayed.push(chunk));
    r.feed(Buffer.from('No such asset set: sprites\n'));
    assert.equal(r.outcome, 'refused');
    assert.equal(Buffer.concat(relayed).toString(), 'No such asset set: sprites\n');
    // And what comes after goes through too
    r.feed(Buffer.from('more\n'));
    assert.equal(Buffer.concat(relayed).toString(), 'No such asset set: sprites\nmore\n');

    // Even where it starts out looking right
    r = new Reply(manifest, () => {});
    r.feed(Buffer.from('smogonctl asset'));
    assert.equal(r.outcome, 'pending', 'a prefix of the magic is still possible');
    r.feed(Buffer.from('!'));
    assert.equal(r.outcome, 'refused');

    r = new Reply(manifest, () => {});
    r.feed(reply([0], 2));
    assert.equal(r.outcome, 'refused');
    assert.match(r.error!, /version 2/);

    r = new Reply(manifest, () => {});
    r.feed(reply([7]));
    assert.equal(r.outcome, 'refused');
    assert.match(r.error!, /position 7/);

    r = new Reply(manifest, () => {});
    r.feed(reply([2]));
    assert.equal(r.outcome, 'refused', 'a __meta/ file is not something to ask for');

    r = new Reply(manifest, () => {});
    r.feed(reply([0, 0]));
    assert.equal(r.outcome, 'refused');
    assert.match(r.error!, /twice/);

    // Hung up partway through the header, and partway through the positions
    r = new Reply(manifest, () => {});
    r.feed(reply([0, 1]).subarray(0, 10));
    r.end();
    assert.equal(r.outcome, 'refused');
    assert.match(r.error!, /hung up/);
    r = new Reply(manifest, () => {});
    r.feed(reply([0, 1]).subarray(0, 26));
    r.end();
    assert.equal(r.outcome, 'refused');

    // An empty answer is an answer
    r = new Reply(manifest, () => {});
    r.feed(reply([]));
    assert.equal(r.outcome, 'ok');
    assert.equal(r.wanted.size, 0);
});

function run(cmd: string, args: string[]) {
    let child = spawn(cmd, args, {stdio: ['pipe', 'pipe', 'inherit']});
    child.stdin!.on('error', () => {});
    let exit = new Promise<number | null>(resolve => child.on('close', resolve));
    return {child, exit};
}

test('negotiate against a command that answers: only what it asked for travels', {timeout: TIMEOUT}, async () => {
    let dir = tmpdir();
    let {aq, manifest} = await sampleQueue(dir);
    let out = pathlib.join(dir, 'seen.json');
    let {child, exit} = run(process.execPath, [pathlib.join(here, 'servers/answer.ts'), out]);
    let relayed: Buffer[] = [];
    let result = await negotiate(child, manifest, chunk => relayed.push(chunk));
    assert.ok('wanted' in result, `should be answered, got ${JSON.stringify(result)}`);
    // Every other asset: position 0 and not 1
    assert.deepEqual([...result.wanted], ['sprites/xy/a-HASH.gif']);
    let send = new Set([...result.wanted, ...manifest.metaFiles]);
    (await aq.pack(dst => send.has(dst))).pipe(child.stdin!);
    assert.equal(await exit, 0);
    let seen = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.deepEqual(seen.manifest.map((e: {name: string}) => e.name), manifest.entries);
    assert.deepEqual(seen.received, [
        {name: 'sprites/xy/a-HASH.gif', size: 9},
        {name: '__meta/xy/manifest.json', size: 2},
    ]);
    assert.equal(Buffer.concat(relayed).toString(), '* 2 received\n', 'the report after the reply is relayed');
});

test('negotiate against a command that refuses: relayed, stdin closed, its exit code kept', {timeout: TIMEOUT}, async () => {
    let {manifest} = await sampleQueue(tmpdir());
    let {child, exit} = run(process.execPath, [pathlib.join(here, 'servers/refuse.ts')]);
    let relayed: Buffer[] = [];
    let result = await negotiate(child, manifest, chunk => relayed.push(chunk));
    assert.ok('error' in result);
    assert.equal(Buffer.concat(relayed).toString(), 'No such asset set: sprites.\n');
    assert.equal(await exit, 3);
});

test('negotiate against cat: an echo of the manifest is not a reply', {timeout: TIMEOUT}, async () => {
    let {manifest} = await sampleQueue(tmpdir());
    let {child, exit} = run('cat', []);
    let result = await negotiate(child, manifest, () => {});
    assert.ok('error' in result, 'the manifest coming back starts with the magic but is no reply');
    // stdin was closed for it, so cat finishes instead of waiting
    assert.equal(await exit, 0);
});

test('negotiate against a command that says nothing: refused when it hangs up', {timeout: TIMEOUT}, async () => {
    let {manifest} = await sampleQueue(tmpdir());
    let {child, exit} = run('true', []);
    let result = await negotiate(child, manifest, () => {});
    assert.ok('error' in result);
    assert.match(result.error!, /hung up|didn't answer/);
    await exit;
});
