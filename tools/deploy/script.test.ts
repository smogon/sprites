
import * as pathlib from './path.js';
import * as script from './script.js';

test('aq', () => {
    const aq = new script.ActionQueue();
    aq.copy("foo", "bar");
    aq.copy("baz", "./bar");
    aq.copy("baz", "/bar")
    
    expect(aq.log).toEqual(expect.arrayContaining([
        {type: 'Copy', src: 'foo', dst: "bar", valid: 'Multiple'},
        {type: 'Copy', src: 'baz', dst: "bar", valid: 'Multiple'},
        {type: 'Copy', src: 'baz', dst: "/bar", valid: 'Absolute'},
    ]));
    
});

test('runOnFile', () => {
    const scr = new script.Script('({name: "25"})', 'expr');
    const dst = script.runOnFile(scr, '/foo/bar/pikachu.png');
    expect(dst).toEqual('25.png');
});

test('run identity', () => {
    const aq = new script.ActionQueue();
    const scr = new script.Script(` list(".").forEach(p => copy(p, p))`, 'expr');
    script.run(scr, "testsrc", aq);
    expect(aq.log).toEqual(expect.arrayContaining([
        {type: 'Copy', src: 'testsrc/32.png', dst: "32.png", valid: 'Success'},
        {type: 'Copy', src: 'testsrc/192-g-vsmogon.png', dst: "192-g-vsmogon.png", valid: 'Success'},
    ]));
});

test('run delta', () => {
    const aq = new script.ActionQueue();
    const scr = new script.Script(` list(".").forEach(p => copy(p, {dir: "dest"}))`, 'expr');
    script.run(scr, "testsrc", aq);
    expect(aq.log).toEqual(expect.arrayContaining([
        {type: 'Copy', src: 'testsrc/32.png', dst: "dest/32.png", valid: 'Success'},
        {type: 'Copy', src: 'testsrc/192-g-vsmogon.png', dst: "dest/192-g-vsmogon.png", valid: 'Success'},
    ]));
});



