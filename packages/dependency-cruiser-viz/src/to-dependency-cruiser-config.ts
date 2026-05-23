import type { IRegularForbiddenRuleType } from 'dependency-cruiser';

import type { DependencyCruiserConfig, Rule } from './types.js';

function pathToPattern(p: string): string {
  return p.endsWith('.ts') || p.endsWith('.tsx') || p.endsWith('.js')
    ? p
    : `${p}/.*`;
}

export function toDependencyCruiserConfig(
  rules: Rule[],
): DependencyCruiserConfig {
  const forbidden: IRegularForbiddenRuleType[] = [];

  for (const rule of rules) {
    const { layers } = rule;

    // layers[0] is top (entry point), layers[n-1] is bottom.
    // Lower layers must not import from upper layers.
    for (let upper = 0; upper < layers.length; upper++) {
      const upperLayer = layers[upper]!;

      for (let lower = upper + 1; lower < layers.length; lower++) {
        const lowerLayer = layers[lower]!;

        for (const fromPath of lowerLayer.paths) {
          for (const toPath of upperLayer.paths) {
            forbidden.push({
              name: `${rule.name}: ${lowerLayer.name} cannot import ${upperLayer.name}`,
              comment: `Layer "${lowerLayer.name}" is below "${upperLayer.name}" in stack "${rule.name}"`,
              severity: 'error',
              from: { path: pathToPattern(fromPath) },
              to: { path: pathToPattern(toPath) },
            });
          }
        }
      }
    }
  }

  return { forbidden };
}
