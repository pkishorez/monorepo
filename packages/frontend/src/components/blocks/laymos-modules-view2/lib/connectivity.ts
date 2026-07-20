import {
  getActiveModulesModel,
  type ActiveModulesModel,
} from '../../laymos-modules/lib/connectivity';
import {
  moduleEdgeKey,
  type LaymosModulesModel,
} from '../../laymos-modules/lib/model';
import type { LaymosModuleSelection } from '../../laymos-modules/types';

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

/** Adds the hovered connected module's transitive dependencies to a selection. */
export function getTreeActiveModulesModel(
  model: LaymosModulesModel,
  selection: LaymosModuleSelection | null,
  preview: string | null,
): ActiveModulesModel {
  const active = getActiveModulesModel(model, selection, preview);
  if (!selection || !preview || preview === selection.path) {
    return active;
  }

  const transitiveComparison = getActiveModulesModel(
    model,
    { path: selection.path, depth: 'transitive' },
    preview,
  );
  if (!transitiveComparison.comparison?.directions.length) return active;

  const downstream = distancesFrom(preview, model.successors);
  const visibleEdgeKeys = new Set([
    ...active.visibleEdgeKeys,
    ...transitiveComparison.focusedEdgeKeys,
  ]);
  const focusedEdgeKeys = new Set(transitiveComparison.focusedEdgeKeys);
  const visibleModules = new Set(active.visibleModules);
  for (const key of transitiveComparison.focusedEdgeKeys) {
    const separator = key.indexOf('\0');
    visibleModules.add(key.slice(0, separator));
    visibleModules.add(key.slice(separator + 1));
  }
  for (const edge of model.observedEdges) {
    const fromDistance = downstream.get(edge.from);
    const toDistance = downstream.get(edge.to);
    if (
      fromDistance === undefined ||
      toDistance === undefined ||
      toDistance !== fromDistance + 1
    ) {
      continue;
    }
    const key = moduleEdgeKey(edge.from, edge.to);
    visibleEdgeKeys.add(key);
    focusedEdgeKeys.add(key);
    visibleModules.add(edge.from);
    visibleModules.add(edge.to);
  }
  return {
    ...active,
    visibleEdgeKeys,
    focusedEdgeKeys,
    visibleModules,
  };
}
