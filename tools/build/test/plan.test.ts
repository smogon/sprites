
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {forEachRule, getRules, resetRules, rule, type RuleDecl} from '../api.ts';
import type {StoredRule, StoredRuleOutput} from '../db.ts';
import {computePlan, type OutputStat, ruleInputSig} from '../plan.ts';

function hashOf(content : string) : Buffer {
    return Buffer.from(content.padEnd(32, '\0'));
}

function makeForeach(input : string, outputDir : string) : RuleDecl {
    resetRules();
    forEachRule(input, {cmds: ['convert %f %o']}, `${outputDir}/%b`);
    const decl = getRules()[0]!;
    assert(decl !== undefined);
    return decl;
}

function stored(decl : RuleDecl, hashes : Map<string, Buffer>,
                opts : {ok? : boolean, outputs? : StoredRuleOutput[]} = {}) : StoredRule {
    return {
        id: 1n,
        key: decl.key,
        command: decl.command,
        display: decl.display,
        template: decl.template,
        inputSig: ruleInputSig(decl, hashes),
        ok: opts.ok ?? true,
        inputs: [
            ...decl.inputs.map(path => ({path, isDep: false, hash: hashes.get(path)!})),
            ...decl.deps.map(path => ({path, isDep: true, hash: hashes.get(path)!})),
        ],
        outputs: opts.outputs ?? decl.outputs.map(path => ({path, size: 10n, mtimeNs: 100n})),
    };
}

function statFrom(entries : Record<string, OutputStat | null>) {
    return (path : string) : OutputStat | null => entries[path] ?? null;
}

const GOOD : OutputStat = {size: 10n, mtimeNs: 100n};

test('unchanged rule is clean', () => {
    const decl = makeForeach('src/a.png', 'build/out');
    const hashes = new Map([['src/a.png', hashOf('A')]]);
    const plan = computePlan({
        current: [decl],
        stored: [stored(decl, hashes)],
        hashes,
        statOutput: statFrom({'build/out/a.png': GOOD}),
        adopt: false,
    });
    assert.deepEqual(plan.clean, [decl]);
    assert.equal(plan.run.length, 0);
});

test('dirty reasons', () => {
    const decl = makeForeach('src/a.png', 'build/out');
    const hashes = new Map([['src/a.png', hashOf('A')]]);
    const cases : [StoredRule, (p : string) => OutputStat | null, string][] = [
        [stored(decl, new Map([['src/a.png', hashOf('OLD')]])),
         statFrom({'build/out/a.png': GOOD}), 'input-changed'],
        [stored(decl, hashes, {ok: false}),
         statFrom({'build/out/a.png': GOOD}), 'failed-last-run'],
        [stored(decl, hashes), statFrom({}), 'output-missing'],
        [stored(decl, hashes),
         statFrom({'build/out/a.png': {size: 11n, mtimeNs: 100n}}), 'output-tampered'],
    ];
    for (const [s, statOutput, reason] of cases) {
        const plan = computePlan({current: [decl], stored: [s], hashes, statOutput, adopt: false});
        assert.deepEqual(plan.run.map(r => r.reason), [reason]);
    }
});

test('unknown rule runs as new; removed rule is stale', () => {
    const decl = makeForeach('src/a.png', 'build/out');
    const gone = makeForeach('src/z.png', 'build/out');
    const hashes = new Map([['src/a.png', hashOf('A')], ['src/z.png', hashOf('Z')]]);
    const plan = computePlan({
        current: [decl],
        stored: [stored(gone, hashes)],
        hashes,
        statOutput: statFrom({}),
        adopt: false,
    });
    assert.deepEqual(plan.run.map(r => r.reason), ['new']);
    assert.deepEqual(plan.stale.map(s => s.key), [gone.key]);
});

test('renamed input with identical content matches instead of running', () => {
    const oldDecl = makeForeach('src/a.png', 'build/out');
    const newDecl = makeForeach('src/b.png', 'build/out');
    const hashes = new Map([['src/a.png', hashOf('SAME')], ['src/b.png', hashOf('SAME')]]);
    const plan = computePlan({
        current: [newDecl],
        stored: [stored(oldDecl, hashes)],
        hashes,
        statOutput: statFrom({'build/out/a.png': GOOD}),
        adopt: false,
    });
    assert.equal(plan.run.length, 0);
    assert.deepEqual(plan.renames.map(r => [r.from.outputs[0]!.path, r.decl.outputs[0]]),
                     [['build/out/a.png', 'build/out/b.png']]);
    // the source rule is still deleted afterward
    assert.deepEqual(plan.stale.map(s => s.key), [oldDecl.key]);
});

test('rename does not match differing content or tampered source outputs', () => {
    const oldDecl = makeForeach('src/a.png', 'build/out');
    const newDecl = makeForeach('src/b.png', 'build/out');

    const differing = new Map([['src/a.png', hashOf('X')], ['src/b.png', hashOf('Y')]]);
    let plan = computePlan({
        current: [newDecl],
        stored: [stored(oldDecl, differing)],
        hashes: differing,
        statOutput: statFrom({'build/out/a.png': GOOD}),
        adopt: false,
    });
    assert.deepEqual(plan.run.map(r => r.reason), ['new']);

    const same = new Map([['src/a.png', hashOf('SAME')], ['src/b.png', hashOf('SAME')]]);
    plan = computePlan({
        current: [newDecl],
        stored: [stored(oldDecl, same)],
        hashes: same,
        statOutput: statFrom({'build/out/a.png': {size: 99n, mtimeNs: 100n}}),
        adopt: false,
    });
    assert.deepEqual(plan.run.map(r => r.reason), ['new']);
});

test('adopt records existing outputs instead of running', () => {
    resetRules();
    rule('src/a.png', {cmds: ['convert %f %o']}, 'build/present.png');
    rule('src/b.png', {cmds: ['convert %f %o']}, 'build/absent.png');
    const [present, absent] = getRules() as [RuleDecl, RuleDecl];
    const hashes = new Map([['src/a.png', hashOf('A')], ['src/b.png', hashOf('B')]]);
    const plan = computePlan({
        current: [present, absent],
        stored: [],
        hashes,
        statOutput: statFrom({'build/present.png': GOOD}),
        adopt: true,
    });
    assert.deepEqual(plan.adopt, [present]);
    assert.deepEqual(plan.run.map(r => r.decl), [absent]);
});
