
import fs from 'fs';
import nodePath from 'path';

import JSON5 from 'json5';

import {BuildError} from '../build/errors.ts';

export interface DeployEntry {
    subset : string[];
    cmd : string;
}

export interface DeployTarget {
    buildFile : string;
    deploy : DeployEntry[];
}

export type DeployConfig = Map<string, DeployTarget>;

function isStringArray(v : unknown) : v is string[] {
    return Array.isArray(v) && v.every(x => typeof x === 'string');
}

export function loadDeployConfig(path : string) : DeployConfig {
    let text : string;
    try {
        text = fs.readFileSync(path, 'utf8');
    } catch {
        throw new BuildError(`missing ${path}; see README ("Deploying") for the schema`);
    }
    let raw : unknown;
    try {
        raw = JSON5.parse(text);
    } catch (err) {
        throw new BuildError(`${path}: ${(err as Error).message}`);
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new BuildError(`${path}: top level must be an object of deploy names`);
    }

    const config : DeployConfig = new Map();
    for (const [name, t] of Object.entries(raw)) {
        const target = t as Partial<DeployTarget>;
        if (typeof t !== 'object' || t === null || typeof target.buildFile !== 'string'
            || !Array.isArray(target.deploy)) {
            throw new BuildError(`${path}: ${name}: expected {buildFile: string, deploy: [...]}`);
        }
        for (const e of target.deploy as Partial<DeployEntry>[]) {
            if (typeof e !== 'object' || e === null
                || !isStringArray(e.subset) || typeof e.cmd !== 'string') {
                throw new BuildError(
                    `${path}: ${name}: each deploy entry needs {subset: string[], cmd: string}`);
            }
        }
        config.set(name, target as DeployTarget);
    }
    return config;
}

// Route finish outputs to deploy entries: per entry, the set of dsts its
// subset globs match. Every glob must match something and every dst must be
// covered by some entry; to unship an output, don't emit it in finish.
export function matchSubsets(dsts : readonly string[],
                             entries : readonly DeployEntry[]) : Set<string>[] {
    const covered = new Set<string>();
    const perEntry = entries.map(entry => {
        const matched = new Set<string>();
        for (const glob of entry.subset) {
            const hits = dsts.filter(d => nodePath.matchesGlob(d, glob));
            if (hits.length === 0) {
                throw new BuildError(`subset glob matches no outputs: ${glob}`);
            }
            for (const hit of hits) {
                matched.add(hit);
                covered.add(hit);
            }
        }
        return matched;
    });
    const uncovered = dsts.filter(d => !covered.has(d));
    if (uncovered.length > 0) {
        const shown = uncovered.slice(0, 10).join('\n  ');
        const more = uncovered.length > 10 ? `\n  ... and ${uncovered.length - 10} more` : '';
        throw new BuildError(`outputs not covered by any deploy entry:\n  ${shown}${more}`);
    }
    return perEntry;
}
