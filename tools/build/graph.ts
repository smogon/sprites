
import type {RuleDecl} from './api.ts';
import {BuildError} from './errors.ts';

export {BuildError};

export interface GraphResult {
    order : RuleDecl[];           // topological, stable w.r.t. declaration order
    generated : Set<string>;      // every path produced by some rule
}

export function checkGraph(rules : RuleDecl[]) : GraphResult {
    const owner = new Map<string, RuleDecl>();
    for (const rule of rules) {
        for (const output of rule.outputs) {
            const other = owner.get(output);
            if (other !== undefined) {
                throw new BuildError(
                    `Output ${output} produced by multiple rules:\n  ${other.command}\n  ${rule.command}`);
            }
            owner.set(output, rule);
        }
    }

    const consumers = new Map<RuleDecl, RuleDecl[]>();
    const indegree = new Map<RuleDecl, number>();
    for (const rule of rules) {
        indegree.set(rule, 0);
    }
    for (const rule of rules) {
        for (const input of [...rule.inputs, ...rule.deps]) {
            const producer = owner.get(input);
            if (producer !== undefined && producer !== rule) {
                let list = consumers.get(producer);
                if (list === undefined) {
                    consumers.set(producer, list = []);
                }
                list.push(rule);
                indegree.set(rule, indegree.get(rule)! + 1);
            }
        }
    }

    const queue = rules.filter(r => indegree.get(r) === 0);
    const order = [];
    for (let i = 0; i < queue.length; i++) {
        const rule = queue[i]!;
        order.push(rule);
        for (const consumer of consumers.get(rule) ?? []) {
            const deg = indegree.get(consumer)! - 1;
            indegree.set(consumer, deg);
            if (deg === 0) {
                queue.push(consumer);
            }
        }
    }
    if (order.length !== rules.length) {
        const stuck = rules.filter(r => indegree.get(r)! > 0);
        throw new BuildError(`Dependency cycle involving:\n  ${stuck.map(r => r.command).join('\n  ')}`);
    }

    return {order, generated: new Set(owner.keys())};
}
