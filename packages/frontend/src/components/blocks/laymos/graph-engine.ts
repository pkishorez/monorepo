import type { NamedLayerGraph } from './layers/layer-graphs';
import type { Layer, LayerRule } from './layers/model';

export interface GraphGroup {
  readonly id: string;
  readonly description?: string;
  readonly rules: readonly LayerRule[];
  readonly layerIds: readonly string[];
}

export interface ConfiguredLayerEdge {
  readonly fromLayerId: string;
  readonly toLayerId: string;
  readonly graphIds: readonly string[];
}

export function graphGroups(input: {
  readonly layers: readonly Layer[];
  readonly rules: readonly LayerRule[];
  readonly layerGraphs?: readonly NamedLayerGraph[];
}): readonly GraphGroup[] {
  const configured = input.layerGraphs ?? [];
  if (configured.length === 0) {
    return [
      group(
        'layers',
        undefined,
        input.rules,
        input.layers.map(({ id }) => id),
      ),
    ];
  }

  const groups = configured.map((graph) =>
    group(
      graph.id,
      graph.description,
      graph.rules,
      referencedLayerIds(graph.rules),
    ),
  );
  const assigned = new Set(groups.flatMap(({ layerIds }) => layerIds));
  const unassigned = input.layers
    .map(({ id }) => id)
    .filter((id) => !assigned.has(id));
  return unassigned.length === 0
    ? groups
    : [...groups, group('other-layers', undefined, [], unassigned)];
}

function group(
  id: string,
  description: string | undefined,
  rules: readonly LayerRule[],
  layerIds: readonly string[],
): GraphGroup {
  return {
    id,
    rules,
    layerIds,
    ...(description === undefined ? {} : { description }),
  };
}

function referencedLayerIds(rules: readonly LayerRule[]): readonly string[] {
  return [
    ...new Set(
      flattenRules(rules).flatMap(({ fromLayerId, toLayerId }) => [
        fromLayerId,
        toLayerId,
      ]),
    ),
  ];
}

export function graphMemberships(
  groups: readonly GraphGroup[],
): ReadonlyMap<string, readonly string[]> {
  const memberships = new Map<string, string[]>();
  for (const graph of groups) {
    for (const layerId of graph.layerIds) {
      const graphIds = memberships.get(layerId) ?? [];
      graphIds.push(graph.id);
      memberships.set(layerId, graphIds);
    }
  }
  return memberships;
}

export function mergeConfiguredLayerEdges(
  groups: readonly GraphGroup[],
): readonly ConfiguredLayerEdge[] {
  const byPair = new Map<string, ConfiguredLayerEdge>();
  for (const graph of groups) {
    for (const edge of flattenRules(graph.rules)) {
      const id = `${edge.fromLayerId}\0${edge.toLayerId}`;
      const current = byPair.get(id);
      byPair.set(id, {
        ...edge,
        graphIds: [...(current?.graphIds ?? []), graph.id],
      });
    }
  }
  return [...byPair.values()];
}

export function computeLayerRanks(
  layers: readonly Layer[],
  edges: readonly ConfiguredLayerEdge[],
): ReadonlyMap<string, number> {
  const predecessors = new Map(layers.map(({ id }) => [id, new Set<string>()]));
  for (const edge of edges) {
    predecessors.get(edge.toLayerId)?.add(edge.fromLayerId);
  }
  const ranks = new Map<string, number>();
  const visiting = new Set<string>();
  const rank = (layerId: string): number => {
    const known = ranks.get(layerId);
    if (known !== undefined) return known;
    if (visiting.has(layerId)) return 0;
    visiting.add(layerId);
    const incoming = predecessors.get(layerId) ?? new Set<string>();
    const value =
      incoming.size === 0
        ? 0
        : Math.max(...[...incoming].map((parent) => rank(parent))) + 1;
    visiting.delete(layerId);
    ranks.set(layerId, value);
    return value;
  };
  for (const layer of layers) rank(layer.id);
  return ranks;
}

export function graphIdentity(
  layers: readonly Layer[],
  rules: readonly LayerRule[],
  layerGraphs?: readonly NamedLayerGraph[],
): string {
  return JSON.stringify([
    layers.map((layer) => layer.id),
    (layerGraphs ?? [{ id: 'layers', rules }]).map((graph) => [
      graph.id,
      flattenRules(graph.rules).map((rule) => [
        rule.fromLayerId,
        rule.toLayerId,
      ]),
    ]),
  ]);
}

export function flattenRules(
  rules: readonly LayerRule[],
): readonly { fromLayerId: string; toLayerId: string }[] {
  return rules.flatMap((rule) =>
    rule.toLayerIds.map((toLayerId) => ({
      fromLayerId: rule.fromLayerId,
      toLayerId,
    })),
  );
}
