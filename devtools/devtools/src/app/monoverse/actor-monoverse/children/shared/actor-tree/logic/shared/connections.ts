import { isWithin } from '../../../../../../server/rpc/contract/index.js';
import type { Link } from '../../../../../../services/monorepo/contract/index.js';
import { ancestorsOf } from '../../../../../logic/shared/index.js';

/*
 * What a selected node is connected to, rolled up to the tree as drawn.
 * Only links that cross the selection's edge count: from something inside
 * it to something outside ("uses"), or the other way ("used by"). Links
 * between two things inside it are its own business and never shown.
 * Each one lands on the node on screen that holds its far end: a sibling
 * of the selection, something beside one of its ancestors, or, where those
 * are open, something inside them; a closed folder stands for everything
 * in it, with a count.
 */

export interface Connection {
  /** How many files (or Packages) there the selection imports. */
  readonly uses: number;
  /** How many files (or Packages) there import the selection. */
  readonly usedBy: number;
  /** How many of either cross by a broken link: a Violation or a cycle. */
  readonly broken: number;
}

/** The key a link is known by in a set of broken links. */
export const linkKey = ([from, to]: Link) => `${from}\0${to}`;

/**
 * Every node on screen the selection is connected to, by `place`, which
 * names the node on screen holding a path, or nothing when none does.
 */
export function connectionsOf(
  selected: string,
  links: ReadonlyArray<Link>,
  place: (path: string) => string | undefined,
  broken: ReadonlySet<string> = new Set(),
): ReadonlyMap<string, Connection> {
  const found = new Map<
    string,
    { uses: Set<string>; usedBy: Set<string>; broken: Set<string> }
  >();
  const at = (node: string) => {
    let entry = found.get(node);
    if (entry === undefined) {
      entry = { uses: new Set(), usedBy: new Set(), broken: new Set() };
      found.set(node, entry);
    }
    return entry;
  };
  for (const link of links) {
    const [from, to] = link;
    const fromInside = isWithin(from, selected);
    const toInside = isWithin(to, selected);
    if (fromInside === toInside) continue;
    const far = fromInside ? to : from;
    const node = place(far);
    if (node === undefined) continue;
    const entry = at(node);
    (fromInside ? entry.uses : entry.usedBy).add(far);
    if (broken.has(linkKey(link))) entry.broken.add(far);
  }
  return new Map(
    [...found].map(([node, entry]) => [
      node,
      {
        uses: entry.uses.size,
        usedBy: entry.usedBy.size,
        broken: entry.broken.size,
      },
    ]),
  );
}

/**
 * The folders to open, from `folder` down, so that every file inside it
 * connected to the selection is on screen: how a closed folder that lights
 * up is opened to what it holds.
 */
export function foldersToReveal(
  folder: string,
  selected: string,
  links: ReadonlyArray<Link>,
): ReadonlyArray<string> {
  const folders = new Set<string>([folder]);
  for (const [from, to] of links) {
    const fromInside = isWithin(from, selected);
    if (fromInside === isWithin(to, selected)) continue;
    const far = fromInside ? to : from;
    if (!isWithin(far, folder) || far === folder) continue;
    for (const at of ancestorsOf(far)) {
      if (at === folder || !isWithin(at, folder)) break;
      folders.add(at);
    }
  }
  return [...folders].sort();
}
