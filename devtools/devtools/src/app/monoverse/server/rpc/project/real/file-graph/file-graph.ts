import { Data, Effect } from 'effect';

import type { Snapshot } from '../../../../services/snapshots/contract/index.js';
import type { Import } from '../../contract/index.js';
import { createResolver, sourceExtensions } from './resolver.js';
import { extractSpecifiers } from './specifiers.js';

export class FileGraphError extends Data.TaggedError('FileGraphError')<{
  readonly root: string;
  readonly cause: unknown;
}> {}

/**
 * Which source file imports which, at a branch, as OXC parses them and
 * the snapshot's own files resolve them: of `files`, the root-relative
 * files git knows, every source file takes part, tests included.
 * Declaration files and minified files are left out. Imports are
 * root-relative and sorted.
 */
export function buildFileGraph(
  snapshot: Snapshot,
  files: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<Import>, FileGraphError> {
  return Effect.tryPromise({
    try: async () => {
      const sources = files.filter(isSourceFile);
      const eligible = new Set(sources);
      const resolver = createResolver(snapshot, new Set(files));
      const contents = await snapshot.readMany(sources);
      const decoder = new TextDecoder();
      const imports: Array<Import> = [];
      for (const from of sources) {
        const bytes = contents.get(from);
        // A file that cannot be read now imports nothing.
        if (bytes === undefined) continue;
        let specifiers: Array<string>;
        try {
          specifiers = extractSpecifiers(from, decoder.decode(bytes));
        } catch {
          continue;
        }
        const targets = new Set<string>();
        for (const specifier of specifiers) {
          const to = await resolver.resolve(from, specifier);
          if (to !== undefined && to !== from && eligible.has(to))
            targets.add(to);
        }
        for (const to of targets) imports.push([from, to]);
      }
      return imports.sort(
        ([fromA, toA], [fromB, toB]) =>
          fromA.localeCompare(fromB) || toA.localeCompare(toB),
      );
    },
    catch: (cause) => new FileGraphError({ root: snapshot.root, cause }),
  });
}

function isSourceFile(path: string): boolean {
  return (
    sourceExtensions.some((extension) => path.endsWith(extension)) &&
    !/\.d\.[cm]?ts$/.test(path) &&
    !/\.min\.(?:[cm]?js|jsx)$/.test(path)
  );
}
