import type { LayerGraph } from '../types.js';

/**
 * Transitive closure of a layer graph's edges: for each layer name, the set
 * of layer names reachable through one or more directed edges.
 */
export function reachableLayers(graph: LayerGraph): Map<string, Set<string>> {
  const direct = new Map<string, Set<string>>();
  for (const l of graph.layers) direct.set(l.name, new Set());
  for (const e of graph.edges) direct.get(e.from.name)!.add(e.to.name);

  const closure = new Map<string, Set<string>>();
  for (const l of graph.layers) {
    const reachable = new Set<string>();
    const queue = [...direct.get(l.name)!];
    while (queue.length > 0) {
      const next = queue.pop()!;
      if (reachable.has(next)) continue;
      reachable.add(next);
      queue.push(...(direct.get(next) ?? []));
    }
    closure.set(l.name, reachable);
  }
  return closure;
}
