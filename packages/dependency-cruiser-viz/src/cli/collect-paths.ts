import type { Rule } from '../types.js';

export function collectPaths(rules: Rule[]): string[] {
  const paths = new Set<string>();

  for (const rule of rules) {
    for (const layer of rule.layers) {
      for (const p of layer.paths) {
        paths.add(p);
      }
    }
  }

  return [...paths];
}
