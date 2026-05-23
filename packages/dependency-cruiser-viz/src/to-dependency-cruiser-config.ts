import type { IRegularForbiddenRuleType } from 'dependency-cruiser';

import type { DependencyCruiserConfig, Feature, Rule } from './types.js';

function pathToPattern(p: string): string {
  return p.endsWith('.ts') || p.endsWith('.tsx') || p.endsWith('.js')
    ? p
    : `${p}/.*`;
}

export function toDependencyCruiserConfig(
  rules: Rule[],
  features?: Feature[],
): DependencyCruiserConfig {
  const forbidden: IRegularForbiddenRuleType[] = [];

  for (const rule of rules) {
    const { layers } = rule;

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

  if (features && features.length > 0) {
    const allFeaturePaths = new Set<string>();
    for (const f of features) {
      for (const p of f.paths) {
        allFeaturePaths.add(p);
      }
    }

    for (const feat of features) {
      const featurePathSet = new Set(feat.paths);
      const foreignPaths = [...allFeaturePaths].filter(
        (p) => !featurePathSet.has(p),
      );

      for (const fromPath of feat.paths) {
        for (const toPath of foreignPaths) {
          forbidden.push({
            name: `feature ${feat.name}: cannot import ${toPath}`,
            comment: `Path "${toPath}" is not part of feature "${feat.name}"`,
            severity: 'error',
            from: { path: pathToPattern(fromPath) },
            to: { path: pathToPattern(toPath) },
          });
        }
      }
    }
  }

  return { forbidden };
}
