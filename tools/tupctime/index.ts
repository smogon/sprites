
import fs from 'fs';
import pathlib from 'path';
import Database from 'better-sqlite3';
import debugfn from 'debug';

const debug = debugfn('tupctime');

const start = process.argv[2];
if (start !== undefined) {
    process.chdir(start);
}

while (true) {
    if (fs.existsSync('.tup')) {
        break;
    }

    if (process.cwd() === '/') {
        throw new Error("Can't find tup root.");
    }

    process.chdir('..');
}

const db = new Database('.tup/db');

const TUP_DB_FILE = 0;
const TUP_DB_DIR = 2;
const TUP_DB_GENERATED = 4;
const TUP_DB_GENERATED_DIR = 7;

// ^ and $ are virtual directories for environment variables
const traversalQuery = db.prepare(`
SELECT id, type, mtime as ctime, name 
FROM node 
WHERE dir = ? 
AND type IN (${TUP_DB_FILE}, ${TUP_DB_DIR}, ${TUP_DB_GENERATED}, ${TUP_DB_GENERATED_DIR})
AND name NOT IN ('^', '$')`);
const updateQuery = db.prepare(`UPDATE node SET mtime = ? WHERE id = ?`);

function update() {
    const stack : {isDir: boolean, id : number, path: string, ctime?: bigint, name?: string}[] = [{isDir: true, id: 0, path: "."}];

    let item;
    while (item = stack.pop()) {
        if (!fs.existsSync(item.path)) {
            debug(`Ignoring ${item.path}`);
            continue;
        }
        
        if (item.isDir) {
            for (const {id, type, ctime, name} of traversalQuery.iterate(item.id)) {
                const isDir = [TUP_DB_DIR, TUP_DB_GENERATED_DIR].includes(type);
                const path = pathlib.join(item.path, name);
                stack.push({isDir, id, ctime: BigInt(ctime), path});
            }
        } else {
            // bigint calculation is necessary to avoid rounding errors/spurious update
            //
            // typescript doesn't understand second argument to lstatSync, or
            // that division can work between a number and bigint, so ignore
            //
            // @ts-ignore
            const ctime = fs.lstatSync(item.path, {bigint: true}).ctimeMs / 1000n;
            if (ctime !== item.ctime) {
                debug(`Updating ${item.path}: ${ctime}, ${item.ctime}`);
                if (updateQuery.run(ctime, item.id).changes !== 1)
                    throw new Error(`Couldn't update ${item.path}`);
            }
        }
    }
}

db.transaction(update)();
