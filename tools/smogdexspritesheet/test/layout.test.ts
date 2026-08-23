
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {pack, place, stylesheet, type Cell, type Region} from '../layout.ts';

function cells(...sprites: [string[], number, number][]): Cell[] {
    return sprites.map(([names, width, height]) => ({names, image: {width, height}}));
}

function regions(...rs: Region[]): Region[] {
    return rs;
}

// The stylesheet is the only place the layout is written down for anyone else,
// so read the geometry back out of it the way a browser would: pull the two
// calc() expressions apart and work them out for a given --i.
function readGeometry(css: string, selector: string): (i: number) => {x: number, y: number} {
    let rule = css.split('\n').find(l => l.startsWith(`${selector}{`));
    assert.ok(rule !== undefined, `no rule for ${selector}`);
    let m = rule.match(
        /background-position:calc\(mod\(var\(--i\),(\d+)\)\*-(\d+)px\) calc\(round\(down,var\(--i\)\/(\d+),1\)\*-(\d+)px(?: - (\d+)px)?\)/);
    assert.ok(m !== null, `unreadable geometry in ${rule}`);
    let [cols, cellW, rowCols, cellH, offset] =
        [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5] ?? 0)];
    assert.equal(rowCols, cols, 'the two axes disagree about the column count');
    return i => ({
        x: (i % cols) * cellW,
        y: Math.floor(i / cols) * cellH + offset,
    });
}

test('a cell is as big as its region\'s largest sprite', () => {
    let sheet = pack(regions(
        {name: 'a', modifier: null, cells: cells([['x'], 10, 8], [['y'], 6, 12], [['z'], 4, 4])}));
    let [a] = sheet.layouts;
    assert.ok(a !== undefined);
    assert.equal(a.cellW, 10);
    assert.equal(a.cellH, 12);
});

test('the css agrees with place() at every index', () => {
    let pokemon = cells(...Array.from({length: 41}, (_, i): [string[], number, number] =>
        [[`p${i}`], 20 + (i % 3) * 10, 20 + (i % 4) * 2]));
    let items = cells(...Array.from({length: 45}, (_, i): [string[], number, number] =>
        [[`i${i}`], 8 + (i % 5), 8 + (i % 6)]));
    let sheet = pack(regions(
        {name: 'pokemon', modifier: null, cells: pokemon},
        {name: 'items', modifier: 'item', cells: items}));
    let css = stylesheet(sheet, './spritesheet.webp');

    for (let [n, layout] of sheet.layouts.entries()) {
        let selector = layout.modifier === null ? '.sprite' : `.sprite.${layout.modifier}`;
        let geometry = readGeometry(css, selector);
        assert.ok(layout.cells.length > layout.cols, `region ${n} is one row, which tests nothing`);
        for (let i = 0; i < layout.cells.length; i++) {
            assert.deepEqual(geometry(i), place(layout, i), `${selector} at --i:${i}`);
        }
    }
});

test('every cell lands inside the sheet, and regions do not overlap', () => {
    let sheet = pack(regions(
        {name: 'a', modifier: null, cells: cells(...Array.from({length: 30},
            (_, i): [string[], number, number] => [[`a${i}`], 12, 9]))},
        {name: 'b', modifier: 'b', cells: cells(...Array.from({length: 30},
            (_, i): [string[], number, number] => [[`b${i}`], 5, 7]))}));
    let bottom = 0;
    for (let layout of sheet.layouts) {
        assert.equal(layout.y, bottom, 'a region starts where the last one ended');
        for (let i = 0; i < layout.cells.length; i++) {
            let {x, y} = place(layout, i);
            assert.ok(x + layout.cellW <= sheet.width, `cell ${i} runs off the right`);
            assert.ok(y + layout.cellH <= sheet.height, `cell ${i} runs off the bottom`);
            assert.ok(y >= layout.y, `cell ${i} sits above its region`);
        }
        bottom = layout.y + Math.ceil(layout.cells.length / layout.cols) * layout.cellH;
    }
    assert.equal(bottom, sheet.height);
});

test('sprites are indexed in name order, aliases sharing one rule', () => {
    let sheet = pack(regions({name: 'a', modifier: null, cells:
        cells([['pikachu'], 20, 20], [['absol', 'absol-alias'], 10, 10])}));
    let css = stylesheet(sheet, './spritesheet.webp');
    assert.ok(css.includes('.sprite-absol,.sprite-absol-alias{--i:0;--w:10}\n'));
    assert.ok(css.includes('.sprite-pikachu{--i:1;--w:20}\n'));
});

test('two sprites cannot claim one name', () => {
    assert.throws(() => pack(regions(
        {name: 'a', modifier: null, cells: cells([['dup'], 4, 4])},
        {name: 'b', modifier: 'b', cells: cells([['dup'], 4, 4])})),
        /dup: claimed by two sprites/);
});

test('an empty region is a broken input, not an empty grid', () => {
    assert.throws(() => pack(regions({name: 'nothing', modifier: null, cells: []})),
        /nothing: no sprites/);
});
