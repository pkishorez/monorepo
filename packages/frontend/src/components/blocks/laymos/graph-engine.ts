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
  const visibleLayerIds = new Set(input.layers.map(({ id }) => id));
  if (configured.length === 0) {
    return [
      group(
        'layers',
        undefined,
        visibleRules(input.rules, visibleLayerIds),
        input.layers.map(({ id }) => id),
      ),
    ];
  }

  const groups = ownedGroups(
    configured
      .map((graph) => {
        const rules = visibleRules(graph.rules, visibleLayerIds);
        return group(
          graph.id,
          graph.description,
          rules,
          referencedLayerIds(graph.rules).filter((id) =>
            visibleLayerIds.has(id),
          ),
        );
      })
      // A LayerGraph none of whose Layers are visible would draw an empty lane.
      .filter(({ layerIds }) => layerIds.length > 0),
  );
  const assigned = new Set(groups.flatMap(({ layerIds }) => layerIds));
  const unassigned = input.layers
    .map(({ id }) => id)
    .filter((id) => !assigned.has(id));
  return unassigned.length === 0
    ? groups
    : [...groups, group('other-layers', undefined, [], unassigned)];
}

// A LayerGraph earns a lane only by owning a Layer no other lane references.
// One that is left holding nothing but Layers spanning its neighbours draws a
// lane with no content of its own.
function ownedGroups(groups: readonly GraphGroup[]): readonly GraphGroup[] {
  const referenceCounts = new Map<string, number>();
  for (const { layerIds } of groups) {
    for (const layerId of layerIds) {
      referenceCounts.set(layerId, (referenceCounts.get(layerId) ?? 0) + 1);
    }
  }
  const owning = groups.filter(({ layerIds }) =>
    layerIds.some((layerId) => referenceCounts.get(layerId) === 1),
  );
  return owning.length === 0 ? groups : owning;
}

function visibleRules(
  rules: readonly LayerRule[],
  visibleLayerIds: ReadonlySet<string>,
): readonly LayerRule[] {
  return rules.flatMap((rule) => {
    if (!visibleLayerIds.has(rule.fromLayerId)) return [];
    const toLayerIds = rule.toLayerIds.filter((id) => visibleLayerIds.has(id));
    return toLayerIds.length === 0 ? [] : [{ ...rule, toLayerIds }];
  });
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
