import { posix } from 'node:path';

import type { ModuleDefinition } from './modules.js';

export function publicEntryPoints(
  modules: Readonly<Record<string, ModuleDefinition>>,
  files: Iterable<string>,
): ReadonlySet<string> {
  const knownFiles = new Set(files);
  return new Set(
    Object.entries(modules).flatMap(([root, definition]) =>
      definition.kind === 'entry'
        ? []
        : [
            ...(knownFiles.has(root) ? [root] : [posix.join(root, 'index.ts')]),
            ...definition.subpaths.map((subpath) =>
              posix.join(root, subpath, 'index.ts'),
            ),
          ],
    ),
  );
}
