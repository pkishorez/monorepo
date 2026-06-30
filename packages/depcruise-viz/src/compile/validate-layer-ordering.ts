import { DEFAULT_GROUP, type Rule } from '../types.js';

/**
 * A layer's identity is `(group, name)`: the same name in a different group is a
 * distinct layer. The ordering graph is keyed on this composite identity, while
 * the human-readable cycle error shows the bare layer name.
 */
type NodeId = string;

export function validateLayerOrdering(rules: readonly Rule[]): void {
  const adjacency = new Map<NodeId, Set<NodeId>>();
  const edgeStacks = new Map<string, string[]>();
  const displayName = new Map<NodeId, string>();

  for (const rule of rules) {
    const group = rule.config.group ?? DEFAULT_GROUP;
    for (let i = 0; i < rule.layers.length - 1; i++) {
      const from = nodeId(group, rule.layers[i]!.name);
      const to = nodeId(group, rule.layers[i + 1]!.name);
      displayName.set(from, rule.layers[i]!.name);
      displayName.set(to, rule.layers[i + 1]!.name);

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
      throw new Error(formatCycleError(cycle, edgeStacks, displayName));
    }
  }
}

function formatCycleError(
  cycle: NodeId[],
  edgeStacks: Map<string, string[]>,
  displayName: Map<NodeId, string>,
): string {
  const label = (node: NodeId): string => displayName.get(node) ?? node;
  const edges: string[] = [];
  for (let i = 0; i < cycle.length - 1; i++) {
    const from = cycle[i]!;
    const to = cycle[i + 1]!;
    const stacks = edgeStacks.get(edgeKey(from, to)) ?? [];
    edges.push(`${label(from)} -> ${label(to)} (${stacks.join(', ')})`);
  }

  return `Layer ordering cycle detected: ${cycle.map(label).join(' -> ')}. Conflicting edges: ${edges.join('; ')}`;
}

function nodeId(group: string, name: string): NodeId {
  return `${group}\0${name}`;
}

function edgeKey(from: NodeId, to: NodeId): string {
  return `${from}\0${to}`;
}
