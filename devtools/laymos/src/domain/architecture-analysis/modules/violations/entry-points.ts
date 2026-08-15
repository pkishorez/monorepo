import { posix } from 'node:path';

import type { ModuleAnalysisContext, ModuleViolation } from '../modules.js';

export function findEntryPointViolations(
  context: ModuleAnalysisContext,
): readonly ModuleViolation[] {
  const files = new Set(context.fileGraph.keys());
  return Object.entries(context.modules).flatMap(([root, definition]) => {
    if (definition.kind === 'entry' || files.has(root)) return [];
    return ['', ...definition.subpaths].flatMap((subpath) => {
      const path = posix.join(root, subpath, 'index.ts');
      return files.has(path)
        ? []
        : [{ kind: 'missing-entry-point' as const, module: root, path }];
    });
  });
}
