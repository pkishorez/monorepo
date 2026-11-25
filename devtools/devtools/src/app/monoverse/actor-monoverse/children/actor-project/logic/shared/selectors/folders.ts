import { isWithin } from '../../../../../../server/rpc/contract/index.js';
import { ancestorsOf } from './paths.js';

export function foldersHolding(
  base: string,
  paths: Iterable<string>,
): ReadonlyArray<string> {
  const folders = new Set<string>();
  for (const path of paths) {
    for (const folder of ancestorsOf(path)) {
      if (folder === base || !isWithin(folder, base)) break;
      folders.add(folder);
    }
  }
  return [...folders].sort();
}

export function isIgnored(
  path: string,
  sourceRoots: ReadonlyArray<string> | null,
): boolean {
  if (sourceRoots === null) return false;
  return !sourceRoots.some(
    (root) => isWithin(path, root) || isWithin(root, path),
  );
}
