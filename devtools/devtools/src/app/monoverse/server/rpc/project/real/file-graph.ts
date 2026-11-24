import { isSource } from '@kestack/monoverse';

import type { Import } from '../contract/index.js';

/** The files that take part in the graph: every source file, but declaration and minified ones. */
export function graphSources(
  files: ReadonlyArray<string>,
): ReadonlyArray<string> {
  return files.filter(
    (path) =>
      isSource(path) &&
      !/\.d\.[cm]?ts$/.test(path) &&
      !/\.min\.(?:[cm]?js|jsx)$/.test(path),
  );
}

/**
 * Which source file imports which, of `files`, root-relative: every file
 * of `graphSources` takes part, tests and scripts included, each import
 * resolved as its Check resolves it, aliases too, as `importsOf` says.
 * An import of a file not taking part is left out. Imports are sorted.
 */
export function fileGraph(
  files: ReadonlyArray<string>,
  importsOf: (
    file: string,
  ) => ReadonlyArray<{ readonly target?: string | undefined }>,
): ReadonlyArray<Import> {
  const sources = graphSources(files);
  const eligible = new Set(sources);
  const imports: Array<Import> = [];
  for (const from of sources) {
    const targets = new Set<string>();
    for (const { target } of importsOf(from))
      if (target !== undefined && target !== from && eligible.has(target))
        targets.add(target);
    for (const to of targets) imports.push([from, to]);
  }
  return imports.sort(
    ([fromA, toA], [fromB, toB]) =>
      fromA.localeCompare(fromB) || toA.localeCompare(toB),
  );
}
