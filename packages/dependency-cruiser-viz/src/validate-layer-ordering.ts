import type { Rule } from './types.js';

export function validateLayerOrdering(rules: readonly Rule[]): void {
  const adjacency = new Map<string, Set<string>>();
  const edgeStacks = new Map<string, string[]>();

  for (const rule of rules) {
    for (let i = 0; i < rule.layers.length - 1; i++) {
      const from = rule.layers[i]!.name;
      const to = rule.layers[i + 1]!.name;

      let targets = adjacency.get(from);
      if (!targets) {
        targets = new Set<string>();
        adjacency.set(from, targets);
      }
      targets.add(to);
      if (!adjacency.has(to)) adjacency.set(to, new Set<string>());

      const key = edgeKey(from, to);
      const stacks = edgeStacks.get(key);
      if (stacks) stacks.push(rule.name);
      else edgeStacks.set(key, [rule.name]);
    }
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const path: string[] = [];

  function visit(layerName: string): string[] | null {
    if (visiting.has(layerName)) {
      const start = path.indexOf(layerName);
      return [...path.slice(start), layerName];
    }
    if (visited.has(layerName)) return null;

    visiting.add(layerName);
    path.push(layerName);

    for (const next of adjacency.get(layerName) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }

    path.pop();
    visiting.delete(layerName);
    visited.add(layerName);
    return null;
  }

  for (const layerName of adjacency.keys()) {
    const cycle = visit(layerName);
    if (cycle) {
      throw new Error(formatCycleError(cycle, edgeStacks));
    }
  }
}

function formatCycleError(
  cycle: string[],
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

function edgeKey(from: string, to: string): string {
  return `${from}\0${to}`;
}
