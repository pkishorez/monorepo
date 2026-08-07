import { posix } from 'node:path';

import type { Config } from '../../config.js';
import type { ConfigValidationIssue } from '../../errors.js';

export function findNestedIssues(
  config: Config,
): readonly ConfigValidationIssue[] {
  return Object.entries(config.modules).flatMap(([root, definition]) => {
    const issues: ConfigValidationIssue[] = [];
    const seen = new Set<string>();
    for (const nested of definition.nested) {
      const path = posix.join(root, nested);
      if (seen.has(nested)) {
        issues.push({
          kind: 'module',
          message: `Module ${root} contains duplicate nested path ${nested}`,
        });
      }
      seen.add(nested);
      if (config.ignoredPaths.some((ignored) => contains(ignored, path))) {
        issues.push({
          kind: 'module',
          message: `Nested Module ${path} is wholly ignored`,
        });
      }
      const otherRoot = Object.keys(config.modules).find(
        (candidate) => candidate !== root && contains(candidate, path),
      );
      if (otherRoot !== undefined) {
        issues.push({
          kind: 'module',
          message: `Nested Module ${path} points into Module ${otherRoot}`,
        });
      }
    }
    return issues;
  });
}

function contains(parent: string, child: string): boolean {
  return parent === '.' || child === parent || child.startsWith(`${parent}/`);
}
