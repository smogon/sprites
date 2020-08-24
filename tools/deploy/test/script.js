
import * as script from '../dist/script.js';
import expect from 'expect';
import path from 'path';
import {fileURLToPath} from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const spriteSrc = path.join(__dirname, "src");

it('aq', () => {
    const aq = new script.ActionQueue();
    aq.copy("foo", "bar");
    aq.debug("test");
    aq.copy("baz", "./bar");
    aq.copy("baz", "/bar")
    
    expect(aq.log).toEqual(expect.arrayContaining([
        {type: 'Op', op: {type: 'Copy', src: 'foo'}, dst: "bar", valid: 'Multiple', debugObjs: []},
        {type: 'Op', op: {type: 'Copy', src: 'baz'}, dst: "bar", valid: 'Multiple', debugObjs: ["test"]},
        {type: 'Op', op: {type: 'Copy', src: 'baz'}, dst: "/bar", valid: 'Absolute', debugObjs: []},
    ]));
    
});

it('runOnFile', () => {
    const scr = new script.Script('name === "rhydont" ? skip() : {name: "25"}', 'expr');
    const aq = new script.ActionQueue();
    script.runOnFile(scr, '/foo/bar/pikachu.png', aq);
    script.runOnFile(scr, '/foo/bar/rhydont.png', aq);
    expect(aq.log.length).toBe(1);
    expect(aq.log).toEqual(expect.arrayContaining([
        {type: 'Op', op: {type: 'Copy', src: '/foo/bar/pikachu.png'}, dst: "25.png", valid: 'Success', debugObjs: []},
    ]));
});

it('run identity', () => {
    const aq = new script.ActionQueue();
    const scr = new script.Script(` list(".").forEach(p => copy(p, p))`, 'expr');
    script.run(scr, spriteSrc, aq);
    expect(aq.log).toEqual(expect.arrayContaining([
        {type: 'Op', op: {type: 'Copy', src: path.join(spriteSrc, '32.png')}, dst: "32.png", valid: 'Success', debugObjs: []},
        {type: 'Op', op: {type: 'Copy', src: path.join(spriteSrc, '192-g-vsmogon.png')}, dst: "192-g-vsmogon.png", valid: 'Success', debugObjs: []},
    ]));
});

it('run delta', () => {
    const aq = new script.ActionQueue();
    const scr = new script.Script(` list(".").forEach(p => copy(p, {dir: "dest"}))`, 'expr');
    script.run(scr, spriteSrc, aq);
    expect(aq.log).toEqual(expect.arrayContaining([
        {type: 'Op', op: {type: 'Copy', src: path.join(spriteSrc, '32.png')}, dst: "dest/32.png", valid: 'Success', debugObjs: []},
        {type: 'Op', op: {type: 'Copy', src: path.join(spriteSrc, '192-g-vsmogon.png')}, dst: "dest/192-g-vsmogon.png", valid: 'Success', debugObjs: []},
    ]));
});



