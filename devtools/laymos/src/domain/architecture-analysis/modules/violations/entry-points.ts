import { posix } from 'node:path';

import type { ModuleAnalysisContext, ModuleViolation } from '../modules.js';

export function findEntryPointViolations(
  context: ModuleAnalysisContext,
): readonly ModuleViolation[] {
  const files = new Set(context.fileGraph.keys());
  return Object.entries(context.modules).flatMap(([root, definition]) =>
    [
      ...(context.unexposedModules.has(root) ? [] : ['']),
      ...definition.nested,
    ].flatMap((nested) => {
      const path = posix.join(root, nested, 'index.ts');
      return files.has(path)
        ? []
        : [{ kind: 'missing-entry-point' as const, module: root, path }];
    }),
  );
}
