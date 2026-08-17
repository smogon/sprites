
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import pathlib from 'node:path';
import {test} from 'node:test';

import {loadDeployConfig, matchSubsets} from '../config.ts';

function configFile(text: string): string {
    let dir = fs.mkdtempSync(pathlib.join(os.tmpdir(), 'deploy-config-test-'));
    let p = pathlib.join(dir, 'deploy.json5');
    fs.writeFileSync(p, text);
    return p;
}

test('loadDeployConfig parses json5 with comments and trailing commas', () => {
    let config = loadDeployConfig(configFile(`{
        // dex assets
        assets: {
            buildFile: "assets.build.ts",
            deploy: [
                {subset: ["**"], cmd: "cat > /dev/null"},
            ],
        },
    }`));
    assert.deepEqual([...config.keys()], ['assets']);
    assert.deepEqual(config.get('assets'), {
        buildFile: 'assets.build.ts',
        deploy: [{subset: ['**'], cmd: 'cat > /dev/null'}],
    });
});

test('loadDeployConfig ties the dir flag to %d in the cmd', () => {
    let dir = loadDeployConfig(configFile(
        '{ps: {buildFile: "ps.build.ts", deploy: [{subset: ["ani/**"], dir: true, cmd: "rsync -a %d/ani/ h:a/"}]}}'));
    assert.equal(dir.get('ps')!.deploy[0]!.dir, true);
    assert.throws(() => loadDeployConfig(configFile(
        '{a: {buildFile: "x.build.ts", deploy: [{subset: ["**"], dir: true, cmd: "rsync -a h:a/"}]}}')),
    /dir entry's cmd must use %d/);
    assert.throws(() => loadDeployConfig(configFile(
        '{a: {buildFile: "x.build.ts", deploy: [{subset: ["**"], cmd: "rsync -a %d/ h:a/"}]}}')),
    /must not use %d \(missing dir: true\?\)/);
});

test('loadDeployConfig rejects missing files and malformed shapes', () => {
    assert.throws(() => loadDeployConfig('/nonexistent/deploy.json5'), /missing/);
    assert.throws(() => loadDeployConfig(configFile('[1]')), /must be an object/);
    assert.throws(() => loadDeployConfig(configFile('{a: {deploy: []}}')), /expected \{buildFile/);
    assert.throws(() => loadDeployConfig(configFile(
        '{a: {buildFile: "x.build.ts", deploy: [{subset: "**", cmd: "c"}]}}')),
    /needs \{subset/);
    assert.throws(() => loadDeployConfig(configFile('{a: {buildFile:')), /deploy.json5:/);
});

test('matchSubsets routes dsts to entries, overlap allowed', () => {
    let dsts = ['xy/a.gif', 'xy/manifest.json', 'xyicons/b.png'];
    let [xy, manifests] = matchSubsets(dsts, [
        {subset: ['xy/**', 'xyicons/**'], cmd: 'one'},
        {subset: ['**/manifest.json'], cmd: 'two'},
    ]);
    assert.deepEqual([...xy!].sort(), dsts);
    assert.deepEqual([...manifests!], ['xy/manifest.json']);
});

test('matchSubsets errors on a glob matching nothing', () => {
    assert.throws(() => matchSubsets(['xy/a.gif'], [{subset: ['xy/**', 'zz/**'], cmd: 'c'}]),
        /matches no outputs: zz\/\*\*/);
});

test('matchSubsets errors on uncovered outputs, listing them', () => {
    assert.throws(() => matchSubsets(['xy/a.gif', 'stray.txt'], [{subset: ['xy/**'], cmd: 'c'}]),
        /not covered by any deploy entry:\n {2}stray.txt/);
});
