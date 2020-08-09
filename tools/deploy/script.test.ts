
import * as pathlib from './path.js';
import * as script from './script.js';

test('runOnFile', () => {
    const scr = new script.Script('({name: "25"})');
    const src = pathlib.path('/foo/bar/pikachu.png');
    const dst = scr.runOnFile(src);
    expect(dst).toEqual(pathlib.path('25.png'));
});

test('run identity', () => {
    const aq = new script.ActionQueue();
    const scr = new script.Script(`
for (const p of list(".")) {
    copy(p, p);
}
    `);
    scr.run("testsrc", aq);
    expect(aq.describe()).toEqual(expect.arrayContaining([
        {src: pathlib.path('testsrc/32.png'), dst: pathlib.path("./32.png")},
        {src: pathlib.path('testsrc/192-g-vsmogon.png'), dst: pathlib.path("./192-g-vsmogon.png")},
    ]));
});

