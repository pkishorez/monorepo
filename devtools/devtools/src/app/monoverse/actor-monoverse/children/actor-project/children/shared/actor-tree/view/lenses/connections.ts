import { useMemo } from 'react';

import type { Link } from '../../../../../../../../services/projects/contract/index.js';
import { visibleOf, type FolderTree } from '../../logic/shared/index.js';
import {
  connectionsOf,
  findingsOf,
  findingsWithin,
  linkKey,
  type BrokenLink,
  type Connection,
  type Finding,
  type Findings,
  type TreePackage,
} from '../../logic/shared/index.js';

/*
 * The Connections and Violations lenses: what the selection uses and is
 * used by, as the tree is drawn now, where the broken links are, and
 * what is wrong with the selection.
 */

/** What the selection connects to, keyed by the node on screen. */
export function useConnections(
  tree: FolderTree,
  isOpen: (path: string) => boolean,
  selected: string | null,
  links: ReadonlyArray<Link>,
  broken: ReadonlyArray<BrokenLink>,
): ReadonlyMap<string, Connection> {
  const brokenKeys = useMemo(
    () =>
      new Set(
        broken.flatMap(({ from, to }) =>
          to === undefined ? [] : [linkKey([from, to])],
        ),
      ),
    [broken],
  );
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

/** What the tree marks on each node: Violations, Packages in a cycle, each Package's Check. */
export function useFindings(
  broken: ReadonlyArray<BrokenLink>,
  packages: ReadonlyArray<TreePackage>,
): Findings {
  return useMemo(() => findingsOf(broken, packages), [broken, packages]);
}

/** What is wrong with the selection, each with what to do about it. */
export function useSelectionFindings(
  selected: string | null,
  base: string,
  broken: ReadonlyArray<BrokenLink>,
  packages: ReadonlyArray<TreePackage>,
): ReadonlyArray<Finding> {
  return useMemo(
    () =>
      selected === null ? [] : findingsWithin(selected, base, broken, packages),
    [selected, base, broken, packages],
  );
}
