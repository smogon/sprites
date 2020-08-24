
import * as script from '../dist/script.js';
import expect from 'expect';
import path from 'path';
import {fileURLToPath} from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const spriteSrc = path.join(__dirname, "src");

it('aq', () => {
    const aq = new script.ActionQueue();
    aq.copy("foo", "bar");
    aq.copy("baz", "./bar");
    aq.copy("baz", "/bar")
    
    expect(aq.log).toEqual(expect.arrayContaining([
        {type: 'Copy', src: 'foo', dst: "bar", valid: 'Multiple', debugObjs: []},
        {type: 'Copy', src: 'baz', dst: "bar", valid: 'Multiple', debugObjs: []},
        {type: 'Copy', src: 'baz', dst: "/bar", valid: 'Absolute', debugObjs: []},
    ]));
    
});

it('runOnFile', () => {
    const scr = new script.Script('({name: "25"})', 'expr');
    const dst = script.runOnFile(scr, '/foo/bar/pikachu.png');
    expect(dst).toEqual('25.png');
});

it('run identity', () => {
    const aq = new script.ActionQueue();
    const scr = new script.Script(` list(".").forEach(p => copy(p, p))`, 'expr');
    script.run(scr, spriteSrc, aq);
    expect(aq.log).toEqual(expect.arrayContaining([
        {type: 'Copy', src: path.join(spriteSrc, '32.png'), dst: "32.png", valid: 'Success', debugObjs: []},
        {type: 'Copy', src: path.join(spriteSrc, '192-g-vsmogon.png'), dst: "192-g-vsmogon.png", valid: 'Success', debugObjs: []},
    ]));
});

it('run delta', () => {
    const aq = new script.ActionQueue();
    const scr = new script.Script(` list(".").forEach(p => copy(p, {dir: "dest"}))`, 'expr');
    script.run(scr, spriteSrc, aq);
    expect(aq.log).toEqual(expect.arrayContaining([
        {type: 'Copy', src: path.join(spriteSrc, '32.png'), dst: "dest/32.png", valid: 'Success', debugObjs: []},
        {type: 'Copy', src: path.join(spriteSrc, '192-g-vsmogon.png'), dst: "dest/192-g-vsmogon.png", valid: 'Success', debugObjs: []},
    ]));
});



