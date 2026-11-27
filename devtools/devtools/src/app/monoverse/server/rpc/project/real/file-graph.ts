import { isSource } from '@kestack/monoverse';

import type { Import } from '../contract/index.js';

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
