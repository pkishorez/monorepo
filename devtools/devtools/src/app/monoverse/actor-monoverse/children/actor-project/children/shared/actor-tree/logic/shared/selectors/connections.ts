import { isWithin } from '../../../../../../../../../server/rpc/contract/index.js';
import type { Link } from '../../../../../../../../../services/projects/contract/index.js';
import { ancestorsOf } from '../../../../../../logic/shared/index.js';

export interface Connection {
  readonly uses: number;
  readonly usedBy: number;
  readonly broken: number;
}

export const linkKey = ([from, to]: Link) => `${from}\0${to}`;

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
