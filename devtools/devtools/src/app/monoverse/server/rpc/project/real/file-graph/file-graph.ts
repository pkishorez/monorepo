import type { EsNode } from '@kestack/monoverse';
import { Data, Effect } from 'effect';

import type { Snapshot } from '../../../../services/snapshots/contract/index.js';
import type { Import } from '../../contract/index.js';
import { createResolver, sourceExtensions } from './resolver.js';
import { parseSource, specifiersOf } from './specifiers.js';

export class FileGraphError extends Data.TaggedError('FileGraphError')<{
  readonly root: string;
  readonly cause: unknown;
}> {}

/**
 * What reads a parsed file besides the graph, such as a Package's check:
 * the files it wants, and each one's parse.
 */
export interface Reader {
  readonly wants: (path: string) => boolean;
  readonly read: (path: string, program: EsNode) => void;
}

/**
 * Which source file imports which, at a branch, as OXC parses them and
 * the snapshot's own files resolve them: of `files`, the root-relative
 * files git knows, every source file takes part, tests included.
 * Declaration files and minified files are left out. Imports are
 * root-relative and sorted. `reader` is handed the parse of each file it
 * wants, so no file is parsed twice.
 */
export function buildFileGraph(
  snapshot: Snapshot,
  files: ReadonlyArray<string>,
  reader?: Reader,
): Effect.Effect<ReadonlyArray<Import>, FileGraphError> {
  return Effect.tryPromise({
    try: async () => {
      const sources = files.filter(isSourceFile);
      const eligible = new Set(sources);
      const resolver = createResolver(snapshot, new Set(files));
      const imports: Array<Import> = [];
      await parseEach(snapshot, sources, reader, async (from, specifiers) => {
        const targets = new Set<string>();
        for (const specifier of specifiers) {
          const to = await resolver.resolve(from, specifier);
          if (to !== undefined && to !== from && eligible.has(to))
            targets.add(to);
        }
        for (const to of targets) imports.push([from, to]);
      });
      return imports.sort(
        ([fromA, toA], [fromB, toB]) =>
          fromA.localeCompare(fromB) || toA.localeCompare(toB),
      );
    },
    catch: (cause) => new FileGraphError({ root: snapshot.root, cause }),
  });
}

/** Hands `reader` the parse of each source file of `files` it wants, and builds no graph. */
export function readFiles(
  snapshot: Snapshot,
  files: ReadonlyArray<string>,
  reader: Reader,
): Effect.Effect<void, FileGraphError> {
  return Effect.tryPromise({
    try: () =>
      parseEach(
        snapshot,
        files.filter((path) => isSourceFile(path) && reader.wants(path)),
        reader,
      ),
    catch: (cause) => new FileGraphError({ root: snapshot.root, cause }),
  });
}

/**
 * Parses each of `sources` once, handing the parse to `reader` and what
 * it imports to `imported`. A file that cannot be read or parsed now is
 * skipped: it imports nothing.
 */
async function parseEach(
  snapshot: Snapshot,
  sources: ReadonlyArray<string>,
  reader: Reader | undefined,
  imported?: (from: string, specifiers: Array<string>) => Promise<void>,
): Promise<void> {
  const contents = await snapshot.readMany(sources);
  const decoder = new TextDecoder();
  for (const from of sources) {
    const bytes = contents.get(from);
    if (bytes === undefined) continue;
    const text = decoder.decode(bytes);
    let parsed: ReturnType<typeof parseSource>;
    try {
      parsed = parseSource(from, text);
    } catch {
      continue;
    }
    if (reader?.wants(from)) reader.read(from, parsed.program);
    if (imported) await imported(from, specifiersOf(parsed, text));
  }
}

function isSourceFile(path: string): boolean {
  return (
    sourceExtensions.some((extension) => path.endsWith(extension)) &&
    !/\.d\.[cm]?ts$/.test(path) &&
    !/\.min\.(?:[cm]?js|jsx)$/.test(path)
  );
}
