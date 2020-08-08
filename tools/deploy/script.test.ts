
import * as pathlib from './path.js';
import * as script from './script.js';

test('aq', () => {
    const aq = new script.ActionQueue();
    const src = pathlib.path('/foo/bar/pikachu.png');
    const input = pathlib.update(src, {dir: ""});
    const scr = new script.Script('({name: "25"})');
    const result = scr.runOnFile(input);
    const output = pathlib.path(input, result);
    const dst = output;
    aq.copy(src, dst);

    expect(aq.describe()).toEqual([{src: pathlib.path('/foo/bar/pikachu.png'),
                                    dst: pathlib.path('25.png')}]);
});

