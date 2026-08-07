import { posix } from 'node:path';

import type { Config } from '../../config.js';
import type { ConfigValidationIssue } from '../../errors.js';

export function findModulePathIssues(
  modules: Config['modules'],
): readonly ConfigValidationIssue[] {
  return Object.entries(modules).flatMap(([root, definition]) => {
    const issues: ConfigValidationIssue[] = [];
    if (!isCanonical(root, true)) {
      issues.push({
        kind: 'path',
        message: `Module key must be a canonical project-relative directory: ${JSON.stringify(root)}`,
      });
    }
    definition.nested.forEach((path, index) => {
      if (isCanonical(path, false)) return;
      issues.push({
        kind: 'path',
        message: `modules.${root}.nested[${index}] must be a canonical relative directory: ${JSON.stringify(path)}`,
      });
    });
    return issues;
  });
}

function isCanonical(path: string, allowDot: boolean): boolean {
  if (allowDot && path === '.') return true;
  if (
    path.length === 0 ||
    path === '.' ||
    path === '..' ||
    path.includes('\\') ||
    path.startsWith('/') ||
    path.endsWith('/') ||
    path.startsWith('../') ||
    /^[A-Za-z]:/.test(path)
  ) {
    return false;
  }
  return posix.normalize(path) === path;
}
