import type { Config, ConfigValidationIssue } from '../../project-config.js';

interface LayerScope {
  readonly layer: string;
  readonly path: string;
}

export function findOverlaps(
  layers: Config['layers'],
): readonly ConfigValidationIssue[] {
  const scopes = Object.entries(layers).flatMap(([layer, value]) =>
    value.paths.map((path) => ({ layer, path })),
  );
  const issues: ConfigValidationIssue[] = [];

  for (let left = 0; left < scopes.length; left += 1) {
    for (let right = left + 1; right < scopes.length; right += 1) {
      const first = scopes[left]!;
      const second = scopes[right]!;
      if (!pathsOverlap(first.path, second.path)) continue;
      issues.push(overlapIssue(first, second));
    }
  }

  return issues;
}

function pathsOverlap(left: string, right: string): boolean {
  return contains(left, right) || contains(right, left);
}

function contains(parent: string, child: string): boolean {
  return parent === '.' || child === parent || child.startsWith(`${parent}/`);
}

function overlapIssue(
  first: LayerScope,
  second: LayerScope,
): ConfigValidationIssue {
  return {
    kind: 'overlap',
    message: `Layer scopes overlap: ${first.layer}:${first.path} and ${second.layer}:${second.path}`,
  };
}
