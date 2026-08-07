import { posix } from 'node:path';

import type { ModuleDefinition } from './modules.js';

export function findUnexposedModules(
  files: Iterable<string>,
  modules: Readonly<Record<string, ModuleDefinition>>,
): ReadonlySet<string> {
  const knownFiles = new Set(files);
  return new Set(
    Object.entries(modules)
      .filter(
        ([root, definition]) =>
          !knownFiles.has(posix.join(root, 'index.ts')) &&
          !definition.shared &&
          definition.nested.length === 0,
      )
      .map(([root]) => root),
  );
}
