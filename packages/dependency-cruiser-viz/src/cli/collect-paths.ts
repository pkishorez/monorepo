import type { ProjectConfig } from '../types.js';

export function collectPaths(config: ProjectConfig): string[] {
  const paths = new Set<string>();

  for (const rule of config.rules) {
    for (const layer of rule.layers) {
      for (const p of layer.paths) {
        paths.add(p);
      }
    }
  }

  if (config.features) {
    for (const feat of config.features) {
      for (const p of feat.paths) {
        paths.add(p);
      }
    }
  }

  return [...paths];
}
