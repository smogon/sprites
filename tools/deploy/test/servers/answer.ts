// A stand-in for `smogonctl assets upload`: reads the manifest, asks for every
// other asset, takes the tar, and writes what it saw to the path in argv[2] as
// JSON. Prints one line of report after the reply, the way the real one does.

import * as fs from 'node:fs';
import tar from 'tar-stream';

let MAGIC = Buffer.from('smogonctl assets');
let out = process.argv[2]!;

let buf = Buffer.alloc(0);
let pending: {n: number, resolve: (b: Buffer) => void} | null = null;
let ended = false;

process.stdin.on('data', (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk]);
    serve();
});
process.stdin.on('end', () => {
    ended = true;
    serve();
});

function serve() {
    if (pending !== null && buf.length >= pending.n) {
        let {n, resolve} = pending;
        pending = null;
        let head = buf.subarray(0, n);
        buf = buf.subarray(n);
        resolve(head);
    } else if (pending !== null && ended) {
        throw new Error('manifest ended early');
    }
}

function take(n: number): Promise<Buffer> {
    return new Promise(resolve => {
        pending = {n, resolve};
        serve();
    });
}

async function name(): Promise<string> {
    let len = (await take(4)).readUInt32BE(0);
    return (await take(len)).toString();
}

let header = await take(24);
if (!header.subarray(0, 16).equals(MAGIC)) {
    throw new Error('not a manifest');
}
let count = header.readUInt32BE(20);
let manifest: {kind: number, name: string, size?: number, target?: string}[] = [];
for (let i = 0; i < count; i++) {
    let kind = (await take(1))[0]!;
    if (kind === 3) {
        manifest.push({kind, name: await name(), target: await name()});
    } else {
        let size = Number((await take(8)).readBigUInt64BE(0));
        manifest.push({kind, name: await name(), size});
    }
}
let asked = manifest.map((e, i) => i).filter(i => manifest[i]!.kind === 1 && i % 2 === 0);
let reply = Buffer.alloc(24 + 4 * asked.length);
MAGIC.copy(reply);
reply.writeUInt32BE(1, 16);
reply.writeUInt32BE(asked.length, 20);
asked.forEach((index, i) => reply.writeUInt32BE(index, 24 + 4 * i));
process.stdout.write(reply);

// Whatever follows is the tar, or nothing at all.
let received: {name: string, size: number}[] = [];
let extract = tar.extract();
extract.on('entry', (header, stream, next) => {
    received.push({name: header.name, size: header.size ?? 0});
    stream.on('end', next);
    stream.resume();
});
let done = new Promise<void>((resolve, reject) => {
    extract.on('finish', resolve);
    extract.on('error', reject);
});
if (buf.length > 0) {
    extract.write(buf);
}
buf = Buffer.alloc(0);
if (ended) {
    extract.end();
} else {
    process.stdin.pipe(extract);
}
await done;
fs.writeFileSync(out, JSON.stringify({manifest, asked, received}));
process.stdout.write(`* ${received.length} received\n`);
