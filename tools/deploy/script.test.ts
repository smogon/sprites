
import * as pathlib from './path.js';
import * as script from './script.js';

test('correct output', () => {
    const scr = new script.Script('({name: "25"})');
    const src = pathlib.path('/foo/bar/pikachu.png');
    const dst = scr.runOnFile(src);
    expect(dst).toEqual(pathlib.path('25.png'));
});

