import type { Layer, LayerRule } from './model';

export interface NamedLayerGraph {
  readonly id: string;
  readonly description?: string;
  readonly rules: readonly LayerRule[];
}

export function combineLayerGraphRules(
  graphs: readonly NamedLayerGraph[],
): readonly LayerRule[] {
  const targetsBySource = new Map<string, Set<string>>();

  for (const graph of graphs) {
    for (const rule of graph.rules) {
      const targets = targetsBySource.get(rule.fromLayerId) ?? new Set();
      for (const target of rule.toLayerIds) targets.add(target);
      targetsBySource.set(rule.fromLayerId, targets);
    }
  }

  return [...targetsBySource].map(([fromLayerId, targets]) => ({
    fromLayerId,
    toLayerIds: [...targets],
  }));
}

export function layersReferencedByRules(
  layers: readonly Layer[],
  rules: readonly LayerRule[],
): readonly Layer[] {
  const referencedIds = new Set(
    rules.flatMap((rule) => [rule.fromLayerId, ...rule.toLayerIds]),
  );
  return layers.filter((layer) => referencedIds.has(layer.id));
}
