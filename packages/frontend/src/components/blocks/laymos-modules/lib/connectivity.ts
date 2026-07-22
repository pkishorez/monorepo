import type { LaymosModuleSelection } from '../types';
import {
  moduleEdgeKey,
  type LaymosModulesModel,
  type ObservedModuleEdge,
} from './model';

export interface ModuleComparison {
  readonly target: string;
  readonly directions: readonly ('incoming' | 'outgoing')[];
  readonly distance: number | null;
  readonly routeCount: number;
  readonly edgeKeys: ReadonlySet<string>;
}

export interface ActiveModulesModel {
  readonly root: string | null;
  readonly depth: 'direct' | 'transitive';
  readonly comparison: ModuleComparison | null;
  readonly visibleModules: ReadonlySet<string>;
  readonly visibleEdgeKeys: ReadonlySet<string>;
  readonly focusedEdgeKeys: ReadonlySet<string>;
  readonly incomingDistances: ReadonlyMap<string, number>;
  readonly outgoingDistances: ReadonlyMap<string, number>;
}

function distances(
  start: string,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
): Map<string, number> {
  const result = new Map<string, number>([[start, 0]]);
  const queue = [start];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    const distance = result.get(current)!;
    for (const next of adjacency.get(current) ?? []) {
      if (result.has(next)) continue;
      result.set(next, distance + 1);
      queue.push(next);
    }
  }
  return result;
}

function shortestPathEdges(
  start: string,
  target: string,
  model: LaymosModulesModel,
): { edgeKeys: Set<string>; distance: number; routeCount: number } | null {
  const fromStart = distances(start, model.successors);
  const length = fromStart.get(target);
  if (length === undefined) return null;
  const toTarget = distances(target, model.predecessors);
  const edgeKeys = new Set<string>();
  const routeCounts = new Map<string, number>([[start, 1]]);
  const ordered = [...fromStart.entries()].sort(
    (left, right) => left[1] - right[1],
  );
  for (const [module, distance] of ordered) {
    if (distance >= length) continue;
    for (const next of model.successors.get(module) ?? []) {
      const nextDistance = fromStart.get(next);
      const remaining = toTarget.get(next);
      if (
        nextDistance !== distance + 1 ||
        remaining === undefined ||
        distance + 1 + remaining !== length
      ) {
        continue;
      }
      edgeKeys.add(moduleEdgeKey(module, next));
      routeCounts.set(
        next,
        (routeCounts.get(next) ?? 0) + (routeCounts.get(module) ?? 0),
      );
    }
  }
  return {
    edgeKeys,
    distance: length,
    routeCount: routeCounts.get(target) ?? 0,
  };
}

function transitiveBackbone(
  model: LaymosModulesModel,
  root: string,
  incoming: ReadonlyMap<string, number>,
  outgoing: ReadonlyMap<string, number>,
): Set<string> {
  const result = new Set<string>();
  for (const edge of model.observedEdges) {
    const fromOutgoing = outgoing.get(edge.from);
    const toOutgoing = outgoing.get(edge.to);
    if (fromOutgoing !== undefined && toOutgoing === fromOutgoing + 1) {
      result.add(moduleEdgeKey(edge.from, edge.to));
    }
    const fromIncoming = incoming.get(edge.from);
    const toIncoming = incoming.get(edge.to);
    if (toIncoming !== undefined && fromIncoming === toIncoming + 1) {
      result.add(moduleEdgeKey(edge.from, edge.to));
    }
  }
  result.delete(moduleEdgeKey(root, root));
  return result;
}

function directEdges(
  edges: readonly ObservedModuleEdge[],
  root: string,
): Set<string> {
  return new Set(
    edges
      .filter((edge) => edge.from === root || edge.to === root)
      .map((edge) => moduleEdgeKey(edge.from, edge.to)),
  );
}

function comparisonFor(
  model: LaymosModulesModel,
  root: string,
  target: string,
  depth: 'direct' | 'transitive',
): ModuleComparison {
  const outgoing = shortestPathEdges(root, target, model);
  const incoming = shortestPathEdges(target, root, model);
  const directions: ('incoming' | 'outgoing')[] = [];
  const edgeKeys = new Set<string>();
  let distance: number | null = null;
  let routeCount = 0;
  if (outgoing && (depth === 'transitive' || outgoing.distance === 1)) {
    directions.push('outgoing');
    outgoing.edgeKeys.forEach((key) => edgeKeys.add(key));
    distance = outgoing.distance;
    routeCount += outgoing.routeCount;
  }
  if (incoming && (depth === 'transitive' || incoming.distance === 1)) {
    directions.push('incoming');
    incoming.edgeKeys.forEach((key) => edgeKeys.add(key));
    distance =
      distance === null
        ? incoming.distance
        : Math.min(distance, incoming.distance);
    routeCount += incoming.routeCount;
  }
  return { target, directions, distance, routeCount, edgeKeys };
}

/** Derives visible neighborhoods and comparison paths from controlled state. */
export function getActiveModulesModel(
  model: LaymosModulesModel,
  selection: LaymosModuleSelection | null,
  preview: string | null,
): ActiveModulesModel {
  const root = selection?.path ?? preview;
  const depth = selection?.depth ?? 'direct';
  if (!root || !model.modules.has(root)) {
    return {
      root: null,
      depth,
      comparison: null,
      visibleModules: new Set(),
      visibleEdgeKeys: new Set(),
      focusedEdgeKeys: new Set(),
      incomingDistances: new Map(),
      outgoingDistances: new Map(),
    };
  }

  const incomingDistances = distances(root, model.predecessors);
  const outgoingDistances = distances(root, model.successors);
  const visibleEdgeKeys =
    depth === 'direct'
      ? directEdges(model.observedEdges, root)
      : transitiveBackbone(model, root, incomingDistances, outgoingDistances);
  const visibleModules = new Set<string>([root]);
  for (const key of visibleEdgeKeys) {
    const separator = key.indexOf('\0');
    visibleModules.add(key.slice(0, separator));
    visibleModules.add(key.slice(separator + 1));
  }

  const target = selection && preview !== root ? preview : null;
  const comparison = target ? comparisonFor(model, root, target, depth) : null;
  return {
    root,
    depth,
    comparison,
    visibleModules,
    visibleEdgeKeys,
    focusedEdgeKeys: comparison?.edgeKeys ?? new Set(),
    incomingDistances,
    outgoingDistances,
  };
}
