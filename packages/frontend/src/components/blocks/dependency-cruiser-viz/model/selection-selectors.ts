import type { VisualizationConfig } from '../types';

export function getLayerPaths(
  config: VisualizationConfig,
  layerName: string | null,
): string[] | null {
  if (!layerName) return null;

  const paths: string[] = [];
  for (const stack of config.stacks) {
    for (const layer of stack.layers) {
      if (layer.name === layerName) {
        for (const p of layer.paths) {
          if (!paths.includes(p)) paths.push(p);
        }
      }
    }
  }

  return paths.length > 0 ? paths : null;
}
