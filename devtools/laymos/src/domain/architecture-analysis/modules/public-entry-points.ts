import { posix } from 'node:path';

import type { ModuleDefinition } from './modules.js';

export function publicEntryPoints(
  modules: Readonly<Record<string, ModuleDefinition>>,
  unexposedModules: ReadonlySet<string>,
): ReadonlySet<string> {
  return new Set(
    Object.entries(modules).flatMap(([root, definition]) => [
      ...(unexposedModules.has(root) ? [] : [posix.join(root, 'index.ts')]),
      ...definition.nested.map((nested) =>
        posix.join(root, nested, 'index.ts'),
      ),
    ]),
  );
}
