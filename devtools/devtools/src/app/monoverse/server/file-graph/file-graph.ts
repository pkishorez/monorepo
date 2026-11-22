import { Data, Effect } from 'effect';

import type { Import } from '../../contract/index.js';
import { isWithin } from '../../model/index.js';
import type { Snapshot } from '../snapshot/index.js';
import { createResolver, sourceExtensions } from './resolver.js';
import { extractSpecifiers } from './specifiers.js';

export class FileGraphError extends Data.TaggedError('FileGraphError')<{
  readonly root: string;
  readonly cause: unknown;
}> {}

/**
 * Which source file imports which, at a branch, as OXC parses them and
 * the snapshot's own files resolve them: from `files`, the root-relative
 * files git knows, only the source files inside the Source roots take
 * part. Declaration files, tests and minified files are left out, so a
 * test reaching into the folder it tests is never an edge. Imports are
 * root-relative and sorted.
 */
export function buildFileGraph(
  snapshot: Snapshot,
  files: ReadonlyArray<string>,
  sourceRoots: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<Import>, FileGraphError> {
  return Effect.tryPromise({
    try: async () => {
      const sources = files.filter(
        (path) =>
          isSourceFile(path) &&
          sourceRoots.some((sourceRoot) => isWithin(path, sourceRoot)),
      );
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
    !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path) &&
    !/\.min\.(?:[cm]?js|jsx)$/.test(path)
  );
}
