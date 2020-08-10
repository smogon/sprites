
import * as pathlib from './path.js';
import * as script from './script.js';

test('aq', () => {
    const aq = new script.ActionQueue();
    expect(() => {
        aq.copy("foo", "bar");
        aq.copy("baz", "./bar");
    }).toThrow();
    expect(() => aq.copy("foo", "/bar")).toThrow();
});

test('runOnFile', () => {
    const scr = new script.Script('({name: "25"})', 'expr');
    const src = pathlib.path('/foo/bar/pikachu.png');
    const dst = script.runOnFile(scr, src);
    expect(dst).toEqual(pathlib.path('25.png'));
});

test('run identity', () => {
    const aq = new script.ActionQueue();
    const scr = new script.Script(` list(".").forEach(p => copy(p, p))`, 'expr');
    script.run(scr, "testsrc", aq);
    expect(aq.describe()).toEqual(expect.arrayContaining([
        {src: 'testsrc/32.png', dst: "32.png"},
        {src: 'testsrc/192-g-vsmogon.png', dst: "192-g-vsmogon.png"},
    ]));
});

