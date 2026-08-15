import { posix } from 'node:path';

import type { Config, ConfigValidationIssue } from '../../project-config.js';

export function findSubpathIssues(
  config: Config,
): readonly ConfigValidationIssue[] {
  return Object.entries(config.modules).flatMap(([root, definition]) => {
    const issues: ConfigValidationIssue[] = [];
    if (definition.kind === 'entry' && definition.subpaths.length > 0) {
      issues.push({
        kind: 'module',
        message: `Entry Module ${root} cannot expose Subpaths`,
      });
    }
    const seen = new Set<string>();
    for (const subpath of definition.subpaths) {
      const path = posix.join(root, subpath);
      if (seen.has(subpath)) {
        issues.push({
          kind: 'module',
          message: `Module ${root} contains duplicate Subpath ${subpath}`,
        });
      }
      seen.add(subpath);
      if (config.ignoredPaths.some((ignored) => contains(ignored, path))) {
        issues.push({
          kind: 'module',
          message: `Subpath ${path} is wholly ignored`,
        });
      }
      const otherRoot = Object.keys(config.modules).find(
        (candidate) => candidate !== root && contains(candidate, path),
      );
      if (otherRoot !== undefined) {
        issues.push({
          kind: 'module',
          message: `Subpath ${path} points into Module ${otherRoot}`,
        });
      }
    }
    return issues;
  });
}

function contains(parent: string, child: string): boolean {
  return parent === '.' || child === parent || child.startsWith(`${parent}/`);
}
