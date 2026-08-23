import {spawnSync} from 'node:child_process';

// What a smogon deploy is about to delete off the server:
//
//   node tools/deploy/index.ts run smogon.build.ts -o /tmp/xyout
//   node tools/spritedata/coverage.ts /tmp/xyout [smogon:/smog2/sprites]
//
// deploy.json5 rsyncs xy/ and xyicons/ with --delete-after, so the built tree
// is authoritative and anything the server holds that the build doesn't make
// is about to go. Some of that is meant to: the content-stamped leftovers from
// when these two sets published through Manifest, and the pre-rename spellings
// below that nothing has asked for in years. Anything else is a hole in the
// build, and this finds it before rsync does.
//
// names.ts answers the same question against pokemon-showdown; this one
// answers it against what is actually being served.

let dir = process.argv[2];
let remote = process.argv[3] ?? 'smogon:/smog2/sprites';
if (!dir) {
    throw new Error('usage: node tools/spritedata/coverage.ts <built dir> [remote]');
}

// A stamped name: Manifest's 8 characters of RFC4648 base32 before the
// extension. Lowercase published names can't collide with it.
let STAMPED = /-[A-Z2-7]{8}\.[a-z0-9]+$/;

// The one-time backlog this first authoritative deploy clears. Delete these
// once it has run; anything still matching them after that is a surprise.
//
// The cap spellings, hoopa-alt and darmanitan-zen-galar predate PS's renames
// to Pikachu-Alola, Hoopa-Unbound and Darmanitan-Galar-Zen, all of which the
// build publishes; nothing in smogon.com or forum names the old ones. The
// Alcremie sweets are cosmetic formes PS's data does not carry, so the dex
// never names one either; the only list of them is chatot's, and chatot reads
// play.pokemonshowdown.com first and only falls back here on a 404, which for
// these never happens. The pngs are shadowed by the gifs the build ships. The
// subdirectories are XY-era scratch that no build has ever written.
let BACKLOG = [
    /^(\.gitignore|manifest\.json)$/,
    /^pikachu-(kanto|hoenn|sinnoh|unova|kalos|alola)cap\.gif$/,
    /^(hoopa-alt|darmanitan-zen-galar)\.(gif|png)$/,
    /^alcremie-[a-z-]+-(berry|clover|flower|love|ribbon|star|strawberry)\.gif$/,
    /^(lokix|melmetal|meltan|pawmi|quaquaval|syclant)\.png$/,
    /^(aback|afront|asback|asfront|back|mini|sback|sfront)\//,
];

let holes = 0;
for (let set of ['xy', 'xyicons']) {
    let rsync = spawnSync('rsync', [
        '-n', '-a', '--delete-after', '--itemize-changes',
        `${dir}/${set}/`, `${remote}/${set}`,
    ], {encoding: 'utf8'});
    if (rsync.status !== 0) {
        throw new Error(`rsync ${set}: ${rsync.stderr.trim() || `exit ${rsync.status}`}`);
    }

    let stamped = 0;
    let backlog = 0;
    let unexplained = [];
    for (let line of rsync.stdout.split('\n')) {
        let m = /^\*deleting +(.*)$/.exec(line);
        if (!m) continue;
        let name = m[1]!;
        if (STAMPED.test(name)) {
            stamped++;
        } else if (BACKLOG.some(re => re.test(name))) {
            backlog++;
        } else {
            unexplained.push(name);
        }
    }

    process.stdout.write(`${set}: ${stamped} stamped, ${backlog} backlog, ${unexplained.length} unexplained\n`);
    for (let name of unexplained) {
        process.stdout.write(`  ${name}\n`);
    }
    holes += unexplained.length;
}

if (holes) {
    process.stderr.write(`${holes} served names the build does not make\n`);
    process.exitCode = 1;
}
