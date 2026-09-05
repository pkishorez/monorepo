import type {
  Layer,
  LayerRule,
  NamedLayerGraph,
} from '../analysis-presentation';

// Selection is the loudest state on the canvas, so it is the only thing that
// glows: a filled surface plus a primary bloom, which dimming cannot imitate.
export const selectedNodeClass =
  'border-[2.5px] border-primary bg-primary/10 ring-[3px] ring-primary/35 shadow-[0_0_28px_-4px_var(--primary)]';

// A container holds its own contents, so it carries the same glow at a weight
// that does not drown the Modules inside it.
export const selectedContainerClass =
  'border-primary bg-primary/[0.07] ring-1 ring-primary/40 shadow-[0_0_32px_-6px_var(--primary)]';

export interface GraphGroup {
  readonly id: string;
  readonly description?: string;
  readonly rules: readonly LayerRule[];
  readonly layerIds: readonly string[];
  readonly reachedLayerIds: readonly string[];
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
  readonly isolatedLayerGraphId?: string;
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
        [],
      ),
    ];
  }

  // Hosting is a fact about the Config, so it is resolved before the view
  // filters anything out. Filtering then only decides what is drawn.
  const hosts = resolveHosts(configured);
  const groups = configured
    .map((graph) => {
      const referenced = referencedLayerIds(graph.rules).filter((layerId) =>
        visibleLayerIds.has(layerId),
      );
      return group(
        graph.id,
        graph.description,
        visibleRules(graph.rules, visibleLayerIds),
        referenced.filter((layerId) => hosts.get(layerId) === graph.id),
        referenced.filter((layerId) => hosts.get(layerId) !== graph.id),
      );
    })
    // A lane draws only the Layers it hosts, so one that hosts nothing would be
    // an empty lane. What it reaches is drawn where that Layer actually lives.
    .filter(({ layerIds }) => layerIds.length > 0);
  const unassigned = input.layers
    .map(({ id }) => id)
    .filter((id) => !hosts.has(id));
  const all =
    unassigned.length === 0
      ? groups
      : [...groups, group('other-layers', undefined, [], unassigned, [])];
  return orderGroups(isolate(all, input.isolatedLayerGraphId), hosts);
}

// A LayerGraph hosts the Layers it declares Rules *from*. A Layer it only names
// as a target it reaches, not owns. A Layer nothing declares Rules from — a leaf
// — falls back to the LayerGraph pointing at it hardest, so every Layer has one
// home and no Layer is ever drawn spanning lanes.
function resolveHosts(
  graphs: readonly {
    readonly id: string;
    readonly rules: readonly LayerRule[];
  }[],
): ReadonlyMap<string, string> {
  const outgoing = new Map<string, Map<string, number>>();
  const incoming = new Map<string, Map<string, number>>();
  for (const graph of graphs) {
    for (const { fromLayerId, toLayerId } of flattenRules(graph.rules)) {
      tally(outgoing, fromLayerId, graph.id);
      tally(incoming, toLayerId, graph.id);
    }
  }
  const order = new Map(graphs.map(({ id }, index) => [id, index]));
  const hosts = new Map<string, string>();
  for (const layerId of new Set([...outgoing.keys(), ...incoming.keys()])) {
    const counts = outgoing.get(layerId) ?? incoming.get(layerId)!;
    hosts.set(layerId, strongest(counts, order));
  }
  return hosts;
}

function tally(
  counts: Map<string, Map<string, number>>,
  layerId: string,
  graphId: string,
): void {
  const byGraph = counts.get(layerId) ?? new Map<string, number>();
  byGraph.set(graphId, (byGraph.get(graphId) ?? 0) + 1);
  counts.set(layerId, byGraph);
}

function strongest(
  counts: ReadonlyMap<string, number>,
  order: ReadonlyMap<string, number>,
): string {
  return [...counts].sort(
    ([leftId, left], [rightId, right]) =>
      right - left || order.get(leftId)! - order.get(rightId)!,
  )[0]![0];
}

// Isolation keeps one LayerGraph and, of every other one, only the Layers that
// LayerGraph actually depends on. What each lane reaches is kept, because that
// is still what makes a Layer part of the selection's story.
function isolate(
  groups: readonly GraphGroup[],
  isolatedLayerGraphId: string | undefined,
): readonly GraphGroup[] {
  if (isolatedLayerGraphId === undefined) return groups;
  const target = groups.find(({ id }) => id === isolatedLayerGraphId);
  if (target === undefined) return groups;
  const kept = new Set([...target.layerIds, ...target.reachedLayerIds]);
  return groups
    .map((graph) => ({
      ...graph,
      layerIds: graph.layerIds.filter((layerId) => kept.has(layerId)),
      reachedLayerIds: graph.reachedLayerIds.filter((layerId) =>
        kept.has(layerId),
      ),
      rules: visibleRules(graph.rules, kept),
    }))
    .filter(({ layerIds }) => layerIds.length > 0);
}

// Declaration order in JSON is an accident of editing, so lanes are sorted to
// keep the Rules that leave a lane short. Adjacent swaps until nothing improves.
function orderGroups(
  groups: readonly GraphGroup[],
  hosts: ReadonlyMap<string, string>,
): readonly GraphGroup[] {
  const crossing = groups.flatMap((graph) =>
    flattenRules(graph.rules).flatMap(({ fromLayerId, toLayerId }) => {
      const from = hosts.get(fromLayerId);
      const to = hosts.get(toLayerId);
      return from === undefined || to === undefined || from === to
        ? []
        : [[from, to] as const];
    }),
  );
  if (crossing.length === 0) return groups;

  const ordered = [...groups];
  const span = (): number => {
    const at = new Map(ordered.map(({ id }, index) => [id, index]));
    return crossing.reduce(
      (total, [from, to]) => total + Math.abs(at.get(from)! - at.get(to)!),
      0,
    );
  };
  let current = span();
  for (let pass = 0; pass < ordered.length; pass += 1) {
    let improved = false;
    for (let from = 0; from < ordered.length; from += 1) {
      for (let to = 0; to < ordered.length; to += 1) {
        if (from === to) continue;
        const [moved] = ordered.splice(from, 1);
        ordered.splice(to, 0, moved!);
        const next = span();
        if (next < current) {
          current = next;
          improved = true;
          break;
        }
        ordered.splice(to, 1);
        ordered.splice(from, 0, moved!);
      }
    }
    if (!improved) break;
  }
  return ordered;
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
  reachedLayerIds: readonly string[],
): GraphGroup {
  return {
    id,
    rules,
    layerIds,
    reachedLayerIds,
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

export function layerHosts(
  groups: readonly GraphGroup[],
): ReadonlyMap<string, string> {
  const hosts = new Map<string, string>();
  for (const graph of groups) {
    for (const layerId of graph.layerIds) hosts.set(layerId, graph.id);
  }
  return hosts;
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
  return computeRanks(
    layers.map(({ id }) => id),
    edges.map(({ fromLayerId, toLayerId }) => [fromLayerId, toLayerId]),
  );
}

// Depth below the nodes nothing points to. `from -> to` places `to` one rank
// lower, so declared dependencies always read downward.
export function computeRanks(
  nodeIds: readonly string[],
  edges: readonly (readonly [string, string])[],
): ReadonlyMap<string, number> {
  const predecessors = new Map(nodeIds.map((id) => [id, new Set<string>()]));
  for (const [from, to] of edges) predecessors.get(to)?.add(from);
  const ranks = new Map<string, number>();
  const visiting = new Set<string>();
  const rank = (nodeId: string): number => {
    const known = ranks.get(nodeId);
    if (known !== undefined) return known;
    if (visiting.has(nodeId)) return 0;
    visiting.add(nodeId);
    const incoming = predecessors.get(nodeId) ?? new Set<string>();
    const value =
      incoming.size === 0
        ? 0
        : Math.max(...[...incoming].map((parent) => rank(parent))) + 1;
    visiting.delete(nodeId);
    ranks.set(nodeId, value);
    return value;
  };
  for (const id of nodeIds) rank(id);
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
