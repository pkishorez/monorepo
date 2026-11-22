import { useMemo } from 'react';

import {
  connectionsOf,
  countsWithin,
  linkKey,
  visibleOf,
  type Connection,
  type FolderTree,
  type Link,
} from '../../../model/index.js';

/*
 * The Connections and Violations lenses: what the selection uses and is
 * used by, as the tree is drawn now, and where the broken links are.
 */

/** What the selection connects to, keyed by the node on screen. */
export function useConnections(
  tree: FolderTree,
  isOpen: (path: string) => boolean,
  selected: string | null,
  links: ReadonlyArray<Link>,
  broken: ReadonlyArray<Link>,
): ReadonlyMap<string, Connection> {
  const brokenKeys = useMemo(() => new Set(broken.map(linkKey)), [broken]);
  return useMemo(() => {
    if (selected === null || !tree.nodes.has(selected)) return new Map();
    return connectionsOf(
      selected,
      links,
      (path) => visibleOf(tree, isOpen, path),
      brokenKeys,
    );
  }, [tree, isOpen, selected, links, brokenKeys]);
}

/** How many importers of a broken link each node holds. */
export function useBrokenCounts(
  broken: ReadonlyArray<Link>,
): ReadonlyMap<string, number> {
  return useMemo(() => countsWithin(broken.map(([from]) => from)), [broken]);
}
