
import {createHash} from 'crypto';

import type {RuleDecl} from './api.ts';
import type {StoredRule} from './db.ts';

export type DirtyReason = 'new' | 'failed-last-run' | 'input-changed'
                        | 'output-missing' | 'output-tampered';

export interface OutputStat {
    size : bigint;
    mtimeNs : bigint;
}

export interface Plan {
    clean : RuleDecl[];
    run : {decl : RuleDecl, reason : DirtyReason}[];
    renames : {decl : RuleDecl, from : StoredRule}[];
    stale : StoredRule[];
    adopt : RuleDecl[];
}

export function inputSig(hashes : Buffer[]) : Buffer {
    const h = createHash('sha256');
    for (const hash of hashes) {
        h.update(hash);
    }
    return h.digest();
}

export function ruleInputSig(decl : RuleDecl, hashes : Map<string, Buffer>) : Buffer {
    return inputSig([...decl.inputs, ...decl.deps].map(p => hashes.get(p)!));
}

function renameKey(template : string, sig : Buffer) : string {
    return template + '\0' + sig.toString('hex');
}

export function computePlan(opts : {
    current : RuleDecl[],
    stored : StoredRule[],
    hashes : Map<string, Buffer>,
    statOutput : (path : string) => OutputStat | null,
    adopt : boolean,
}) : Plan {
    const {current, stored, hashes, statOutput, adopt} = opts;

    const storedByKey = new Map<string, StoredRule>();
    const renameIndex = new Map<string, StoredRule[]>();
    for (const s of stored) {
        storedByKey.set(s.key, s);
        if (s.ok) {
            const key = renameKey(s.template, s.inputSig);
            let list = renameIndex.get(key);
            if (list === undefined) {
                renameIndex.set(key, list = []);
            }
            list.push(s);
        }
    }

    const currentKeys = new Set(current.map(r => r.key));
    const plan : Plan = {
        clean: [],
        run: [],
        renames: [],
        stale: stored.filter(s => !currentKeys.has(s.key)),
        adopt: [],
    };

    // A stored rule's outputs are intact iff every recorded output exists on
    // disk with its recorded stat. Rename sources must pass this (never copy
    // tampered or unverified bytes).
    const outputsIntact = (s : StoredRule) : boolean =>
        s.outputs.every(o => {
            if (o.size === null || o.mtimeNs === null) {
                return false;
            }
            const st = statOutput(o.path);
            return st !== null && st.size === o.size && st.mtimeNs === o.mtimeNs;
        });

    const dirtyReason = (s : StoredRule) : DirtyReason | null => {
        if (!s.ok) {
            return 'failed-last-run';
        }
        for (const inp of s.inputs) {
            if (!hashes.get(inp.path)?.equals(inp.hash)) {
                return 'input-changed';
            }
        }
        for (const o of s.outputs) {
            const st = statOutput(o.path);
            if (st === null) {
                return 'output-missing';
            }
            if (st.size !== o.size || st.mtimeNs !== o.mtimeNs) {
                return 'output-tampered';
            }
        }
        return null;
    };

    for (const decl of current) {
        const s = storedByKey.get(decl.key);
        let reason : DirtyReason | null;
        if (s !== undefined) {
            reason = dirtyReason(s);
            if (reason === null) {
                plan.clean.push(decl);
                continue;
            }
        } else {
            reason = 'new';
            const sig = ruleInputSig(decl, hashes);
            const candidates = renameIndex.get(renameKey(decl.template, sig)) ?? [];
            const from = candidates.find(c =>
                c.outputs.length === decl.outputs.length && outputsIntact(c));
            if (from !== undefined) {
                plan.renames.push({decl, from});
                continue;
            }
        }
        if (adopt && decl.outputs.every(p => statOutput(p) !== null)) {
            plan.adopt.push(decl);
        } else {
            plan.run.push({decl, reason});
        }
    }

    return plan;
}
