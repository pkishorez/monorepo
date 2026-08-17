import { posix } from 'node:path';

import type { ResolvedConfig } from '../../project-config/index.js';

// A Module needs a public door when something may import it: a Shared or exposed
// Module, or any Module Graph member, whose Rules must land on a door.
export function publicEntryPoints(
  modules: ResolvedConfig['modules'],
  files: Iterable<string>,
): ReadonlySet<string> {
  const knownFiles = new Set(files);
  return new Set(
    Object.entries(modules)
      .filter(
        ([, definition]) =>
          definition.shared ||
          definition.exposed ||
          definition.graph !== undefined,
      )
      .map(([root]) =>
        knownFiles.has(root) ? root : posix.join(root, 'index.ts'),
      ),
  );
}
