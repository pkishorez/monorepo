import {
  getActiveModulesModel,
  type ActiveModulesModel,
} from '../../laymos-modules/lib/connectivity';
import {
  moduleEdgeKey,
  type LaymosModulesModel,
} from '../../laymos-modules/lib/model';
import type { LaymosModuleSelection } from '../../laymos-modules/types';

/** Returns whether a module may participate in hover for the current scope. */
export function canHoverModule(
  activeSelection: ActiveModulesModel,
  selection: LaymosModuleSelection | null,
  modulePath: string,
): boolean {
  return !selection || activeSelection.visibleModules.has(modulePath);
}

function distancesFrom(
  start: string,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
): Map<string, number> {
  const distances = new Map<string, number>([[start, 0]]);
  const queue = [start];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    for (const next of adjacency.get(current) ?? []) {
      if (distances.has(next)) continue;
      distances.set(next, distances.get(current)! + 1);
      queue.push(next);
    }
  }
  return distances;
}

/** Derives a selected module's direct or transitive bidirectional connections. */
export function getModuleGraphActiveModel(
  model: LaymosModulesModel,
  selection: LaymosModuleSelection | null,
  preview: string | null,
): ActiveModulesModel {
  if (!selection || !model.modules.has(selection.path)) {
    const active = getActiveModulesModel(model, null, preview);
    return preview
      ? {
          ...active,
          comparison: {
            target: preview,
            directions: [],
            distance: null,
            routeCount: 0,
            edgeKeys: new Set(),
          },
        }
      : active;
  }

  const outgoingDistances = distancesFrom(selection.path, model.successors);
  const incomingDistances = distancesFrom(selection.path, model.predecessors);

  const visibleEdgeKeys = new Set<string>();
  for (const edge of model.observedEdges) {
    const outgoingFrom = outgoingDistances.get(edge.from);
    const outgoingTo = outgoingDistances.get(edge.to);
    const incomingFrom = incomingDistances.get(edge.from);
    const incomingTo = incomingDistances.get(edge.to);
    const outgoing =
      outgoingFrom !== undefined && outgoingTo === outgoingFrom + 1;
    const incoming =
      incomingTo !== undefined && incomingFrom === incomingTo + 1;
    if (!outgoing && !incoming) continue;
    if (selection.depth === 'direct' && outgoingFrom !== 0 && incomingTo !== 0)
      continue;
    visibleEdgeKeys.add(moduleEdgeKey(edge.from, edge.to));
  }

  const visibleModules = new Set<string>([selection.path]);
  for (const key of visibleEdgeKeys) {
    const separator = key.indexOf('\0');
    visibleModules.add(key.slice(0, separator));
    visibleModules.add(key.slice(separator + 1));
  }

  return {
    root: selection.path,
    depth: selection.depth,
    comparison: preview
      ? {
          target: preview,
          directions: [],
          distance: null,
          routeCount: 0,
          edgeKeys: new Set(),
        }
      : null,
    visibleModules,
    visibleEdgeKeys,
    focusedEdgeKeys: new Set(),
    incomingDistances,
    outgoingDistances,
  };
}
