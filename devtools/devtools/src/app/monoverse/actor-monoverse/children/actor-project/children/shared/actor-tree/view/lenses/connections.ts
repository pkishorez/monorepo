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

export function useFindings(
  broken: ReadonlyArray<BrokenLink>,
  packages: ReadonlyArray<TreePackage>,
): Findings {
  return useMemo(() => findingsOf(broken, packages), [broken, packages]);
}

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
