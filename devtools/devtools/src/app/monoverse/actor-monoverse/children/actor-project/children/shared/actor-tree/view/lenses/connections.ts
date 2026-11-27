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
  type ExceptedLink,
  type Findings,
  type LinkKinds,
  type SelectionFindings,
  type TreePackage,
} from '../../logic/shared/index.js';

export function useLinkKinds(
  broken: ReadonlyArray<BrokenLink>,
  excepted: ReadonlyArray<ExceptedLink>,
): LinkKinds {
  return useMemo(
    () => ({
      broken: new Set(
        broken.flatMap(({ from, to }) =>
          to === undefined ? [] : [linkKey([from, to])],
        ),
      ),
      excepted: new Set(excepted.map(({ from, to }) => linkKey([from, to]))),
    }),
    [broken, excepted],
  );
}

export function useConnections(
  tree: FolderTree,
  isOpen: (path: string) => boolean,
  selected: string | null,
  links: ReadonlyArray<Link>,
  kinds: LinkKinds,
): ReadonlyMap<string, Connection> {
  return useMemo(() => {
    if (selected === null || !tree.nodes.has(selected)) return new Map();
    return connectionsOf(
      selected,
      links,
      (path) => visibleOf(tree, isOpen, path),
      kinds,
    );
  }, [tree, isOpen, selected, links, kinds]);
}

export function useFindings(
  broken: ReadonlyArray<BrokenLink>,
  excepted: ReadonlyArray<ExceptedLink>,
  packages: ReadonlyArray<TreePackage>,
): Findings {
  return useMemo(
    () => findingsOf(broken, excepted, packages),
    [broken, excepted, packages],
  );
}

const nothing: SelectionFindings = { violations: [], excepted: [] };

export function useSelectionFindings(
  selected: string | null,
  base: string,
  broken: ReadonlyArray<BrokenLink>,
  excepted: ReadonlyArray<ExceptedLink>,
  packages: ReadonlyArray<TreePackage>,
): SelectionFindings {
  return useMemo(
    () =>
      selected === null
        ? nothing
        : findingsWithin(selected, base, broken, excepted, packages),
    [selected, base, broken, excepted, packages],
  );
}
