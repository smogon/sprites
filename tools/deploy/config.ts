
import * as fs from 'node:fs';
import * as nodePath from 'node:path';

import JSON5 from 'json5';

import {BuildError} from '../build/errors.ts';

export interface DeployEntry {
    subset: string[];
    cmd: string;
    // dir entries get their subset materialized into a temp directory whose
    // path replaces %d in cmd; tar entries get the subset tarred on stdin.
    dir?: boolean;
}

export interface DeployTarget {
    buildFile: string;
    deploy: DeployEntry[];
}

export type DeployConfig = Map<string, DeployTarget>;

function isStringArray(v: unknown): v is string[] {
    return Array.isArray(v) && v.every(x => typeof x === 'string');
}

export function loadDeployConfig(path: string): DeployConfig {
    let text: string;
    try {
        text = fs.readFileSync(path, 'utf8');
    } catch {
        throw new BuildError(`missing ${path}; see README ("Deploying") for the schema`);
    }
    let raw: unknown;
    try {
        raw = JSON5.parse(text);
    } catch (err) {
        throw new BuildError(`${path}: ${(err as Error).message}`);
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new BuildError(`${path}: top level must be an object of deploy names`);
    }

    let config: DeployConfig = new Map();
    for (let [name, t] of Object.entries(raw)) {
        let target = t as Partial<DeployTarget>;
        if (typeof t !== 'object' || t === null || typeof target.buildFile !== 'string'
            || !Array.isArray(target.deploy)) {
            throw new BuildError(`${path}: ${name}: expected {buildFile: string, deploy: [...]}`);
        }
        for (let e of target.deploy as Partial<DeployEntry>[]) {
            if (typeof e !== 'object' || e === null
                || !isStringArray(e.subset) || typeof e.cmd !== 'string'
                || (e.dir !== undefined && typeof e.dir !== 'boolean')) {
                throw new BuildError(
                    `${path}: ${name}: each deploy entry needs {subset: string[], cmd: string, dir?: boolean}`);
            }
            if (Boolean(e.dir) !== e.cmd.includes('%d')) {
                throw new BuildError(`${path}: ${name}: ${e.dir
                    ? 'a dir entry\'s cmd must use %d'
                    : 'a tar entry\'s cmd must not use %d (missing dir: true?)'}: ${e.cmd}`);
            }
        }
        config.set(name, target as DeployTarget);
    }
    return config;
}

// Route finish outputs to deploy entries: per entry, the set of dsts its
// subset globs match. Every glob must match something and every dst must be
// covered by some entry; to unship an output, don't emit it in finish.
export function matchSubsets(dsts: readonly string[],
                             entries: readonly DeployEntry[]): Set<string>[] {
    let covered = new Set<string>();
    let perEntry = entries.map(entry => {
        let matched = new Set<string>();
        for (let glob of entry.subset) {
            let hits = dsts.filter(d => nodePath.matchesGlob(d, glob));
            if (hits.length === 0) {
                throw new BuildError(`subset glob matches no outputs: ${glob}`);
            }
            for (let hit of hits) {
                matched.add(hit);
                covered.add(hit);
            }
        }
        return matched;
    });
    let uncovered = dsts.filter(d => !covered.has(d));
    if (uncovered.length > 0) {
        let shown = uncovered.slice(0, 10).join('\n  ');
        let more = uncovered.length > 10 ? `\n  ... and ${uncovered.length - 10} more` : '';
        throw new BuildError(`outputs not covered by any deploy entry:\n  ${shown}${more}`);
    }
    return perEntry;
}
