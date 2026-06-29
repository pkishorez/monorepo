import type { LayerConflict, VisualizationConfig } from '../types.js';

/**
 * Two paths overlap when a file can satisfy both — they are equal, or one is a
 * folder ancestor of the other. (File patterns ending in an extension only
 * overlap on exact equality.)
 */
function pathsOverlap(a: string, b: string): boolean {
  if (a === b) return true;
  return a.startsWith(b + '/') || b.startsWith(a + '/');
}

/**
 * Flags pairs of DISTINCT layers whose path patterns overlap, so a file can
 * match both. Layer matching attributes such a file to the first-declared
 * layer, silently — surfacing these lets the author disambiguate (e.g. by
 * namespacing the layer paths). Same-named layers shared across stacks are
 * intentional and never reported.
 */
export function detectLayerConflicts(
  visualization: VisualizationConfig,
): LayerConflict[] {
  const entries: Array<{ layer: string; path: string }> = [];
  for (const stack of visualization.stacks) {
    for (const layer of stack.layers) {
      for (const path of layer.paths) {
        entries.push({ layer: layer.name, path });
      }
    }
  }

  const conflicts: LayerConflict[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i]!;
      const b = entries[j]!;
      if (a.layer === b.layer) continue;
      if (!pathsOverlap(a.path, b.path)) continue;

      const [layerA, pathA, layerB, pathB] =
        a.layer <= b.layer
          ? [a.layer, a.path, b.layer, b.path]
          : [b.layer, b.path, a.layer, a.path];
      const key = `${layerA}\0${pathA}\0${layerB}\0${pathB}`;
      if (seen.has(key)) continue;
      seen.add(key);

      conflicts.push({ layerA, layerB, pathA, pathB });
    }
  }

  conflicts.sort(
    (x, y) =>
      x.layerA.localeCompare(y.layerA) ||
      x.layerB.localeCompare(y.layerB) ||
      x.pathA.localeCompare(y.pathA) ||
      x.pathB.localeCompare(y.pathB),
  );

  return conflicts;
}
