import { isWithin } from '../../../../../../server/rpc/contract/index.js';
import { ancestorsOf } from './paths.js';

/*
 * Folders as the trees and the lists read them: which to open to show a
 * path, and what lies outside a Package's Source roots.
 */

/** The folders under `base` holding any of `paths`, so opening them shows those. */
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

/**
 * Whether a path lies outside every Source root: neither inside one nor a
 * folder holding one. With no Source roots given, nothing is.
 */
export function isIgnored(
  path: string,
  sourceRoots: ReadonlyArray<string> | null,
): boolean {
  if (sourceRoots === null) return false;
  return !sourceRoots.some(
    (root) => isWithin(path, root) || isWithin(root, path),
  );
}
