import type { IRegularForbiddenRuleType } from 'dependency-cruiser';

import type { DependencyCruiserConfig, Rule } from '../types.js';
import { reachableLayers } from './reachability.js';
import { validateLayerOrdering } from './validate-layer-ordering.js';

function pathToPattern(p: string): string {
  return p.endsWith('.ts') || p.endsWith('.tsx') || p.endsWith('.js')
    ? p
    : `${p}/.*`;
}

export function toDependencyCruiserConfig(
  rules: readonly Rule[] = [],
): DependencyCruiserConfig {
  validateLayerOrdering(rules);

  const forbidden: IRegularForbiddenRuleType[] = [];

  for (const rule of rules) {
    const { layers } = rule;
    const closure = reachableLayers(rule);

    for (const fromLayer of layers) {
      for (const toLayer of layers) {
        if (fromLayer === toLayer) continue;
        if (closure.get(fromLayer.name)!.has(toLayer.name)) continue;

        for (const fromPath of fromLayer.paths) {
          for (const toPath of toLayer.paths) {
            forbidden.push({
              name: `${rule.name}: ${fromLayer.name} cannot import ${toLayer.name}`,
              comment: `No path from "${fromLayer.name}" to "${toLayer.name}" in graph "${rule.name}"`,
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
