
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import pathlib from 'node:path';
import {test} from 'node:test';

import {base, spritedata, spriteglob} from '../helpers.ts';

test('spritedata parses id and flags', () => {
    assert.deepEqual(spritedata('10080'), {id: '10080', data: {}});
    assert.deepEqual(spritedata('10080-a'), {id: '10080', data: {a: true}});
    assert.deepEqual(spritedata('10016-b-s'), {id: '10016', data: {b: true, s: true}});
    assert.deepEqual(spritedata('123-xmega'), {id: '123', data: {x: 'mega'}});
    // Lua gmatch("[^-]+") skips empty segments
    assert.deepEqual(spritedata('12--b'), {id: '12', data: {b: true}});
});

test('base strips directory and final extension', () => {
    assert.equal(base('src/models/6-mega-x.gif'), '6-mega-x');
});

test('spriteglob filters by flag truthiness', () => {
    const dir = fs.mkdtempSync(pathlib.join(os.tmpdir(), 'spriteglob-'));
    try {
        for (const name of ['1.png', '1-a.png', '2-b.png', '2-b-s.png', '3-g.png', '.hidden.png']) {
            fs.writeFileSync(pathlib.join(dir, name), '');
        }
        assert.deepEqual(
            spriteglob(`${dir}/*.png`, {a: false}).map(p => pathlib.basename(p)),
            ['1.png', '2-b-s.png', '2-b.png', '3-g.png']);
        assert.deepEqual(
            spriteglob(`${dir}/*.png`, {b: false, s: false}).map(p => pathlib.basename(p)),
            ['1-a.png', '1.png', '3-g.png']);
        assert.deepEqual(
            spriteglob(`${dir}/*.png`, {b: true}).map(p => pathlib.basename(p)),
            ['2-b-s.png', '2-b.png']);
    } finally {
        fs.rmSync(dir, {recursive: true, force: true});
    }
});
