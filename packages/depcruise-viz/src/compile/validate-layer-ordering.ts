import type { Rule } from '../types.js';

type NodeId = string;

export function validateLayerOrdering(rules: readonly Rule[]): void {
  const adjacency = new Map<NodeId, Set<NodeId>>();
  const edgeStacks = new Map<string, string[]>();

  for (const rule of rules) {
    for (const e of rule.edges) {
      const from = e.from.name;
      const to = e.to.name;

      let targets = adjacency.get(from);
      if (!targets) {
        targets = new Set<NodeId>();
        adjacency.set(from, targets);
      }
      targets.add(to);
      if (!adjacency.has(to)) adjacency.set(to, new Set<NodeId>());

      const key = edgeKey(from, to);
      const stacks = edgeStacks.get(key);
      if (stacks) stacks.push(rule.name);
      else edgeStacks.set(key, [rule.name]);
    }
  }

  const visited = new Set<NodeId>();
  const visiting = new Set<NodeId>();
  const path: NodeId[] = [];

  function visit(node: NodeId): NodeId[] | null {
    if (visiting.has(node)) {
      const start = path.indexOf(node);
      return [...path.slice(start), node];
    }
    if (visited.has(node)) return null;

    visiting.add(node);
    path.push(node);

    for (const next of adjacency.get(node) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }

    path.pop();
    visiting.delete(node);
    visited.add(node);
    return null;
  }

  for (const node of adjacency.keys()) {
    const cycle = visit(node);
    if (cycle) {
      throw new Error(formatCycleError(cycle, edgeStacks));
    }
  }
}

function formatCycleError(
  cycle: NodeId[],
  edgeStacks: Map<string, string[]>,
): string {
  const edges: string[] = [];
  for (let i = 0; i < cycle.length - 1; i++) {
    const from = cycle[i]!;
    const to = cycle[i + 1]!;
    const stacks = edgeStacks.get(edgeKey(from, to)) ?? [];
    edges.push(`${from} -> ${to} (${stacks.join(', ')})`);
  }

  return `Layer ordering cycle detected: ${cycle.join(' -> ')}. Conflicting edges: ${edges.join('; ')}`;
}

function edgeKey(from: NodeId, to: NodeId): string {
  return `${from}\0${to}`;
}
