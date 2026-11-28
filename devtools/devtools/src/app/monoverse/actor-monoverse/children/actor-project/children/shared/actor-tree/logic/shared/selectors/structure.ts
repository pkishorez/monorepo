import {
  isWithin,
  parentOf,
} from '../../../../../../../../../server/rpc/contract/index.js';
import type { Link } from '../../../../../../../../../services/projects/contract/index.js';
import { ancestorsOf } from '../../../../../../logic/shared/index.js';
import type {
  ExceptedLink,
  ReachedBy,
  Structure,
  TreePackage,
} from '../index.js';
import { leavesOf, linkKey, type LinkKinds } from './connections.js';

const rank: Record<ReachedBy, number> = {
  violation: 3,
  exception: 2,
  door: 1,
  module: 0,
};

const byOf = (link: Link, kinds: LinkKinds): ReachedBy => {
  const key = linkKey(link);
  if (kinds.broken.has(key)) return 'violation';
  if (kinds.byException.has(key)) return 'exception';
  if (kinds.excepted.has(key)) return 'door';
  return 'module';
};

const leftBy = (base: string, [from, to]: Link) => {
  const folders: Array<string> = [];
  for (const at of ancestorsOf(from)) {
    if (at === base || !isWithin(at, base) || isWithin(to, at)) break;
    folders.push(at);
  }
  return folders;
};

const noStructure: Structure = {
  folders: 0,
  leaves: new Set(),
  reaches: new Map(),
  doors: new Map(),
};

export function structureOf(
  packages: ReadonlyArray<TreePackage>,
  base: string,
  files: ReadonlyArray<string>,
  links: ReadonlyArray<Link>,
  kinds: LinkKinds,
  excepted: ReadonlyArray<ExceptedLink>,
  doors: ReadonlyArray<string>,
): Structure {
  if (packages.length > 0) return noStructure;
  const found = new Map<string, Map<string, ReachedBy>>();
  for (const link of links) {
    const by = byOf(link, kinds);
    const folder = parentOf(link[1]);
    for (const at of leftBy(base, link)) {
      let reached = found.get(at);
      if (reached === undefined) {
        reached = new Map();
        found.set(at, reached);
      }
      const before = reached.get(folder);
      if (before === undefined || rank[by] > rank[before])
        reached.set(folder, by);
    }
  }
  const reaches = new Map(
    [...found].map(([at, reached]) => [
      at,
      [...reached]
        .map(([folder, by]) => ({ folder, by }))
        .sort(
          (a, b) => rank[b.by] - rank[a.by] || a.folder.localeCompare(b.folder),
        ),
    ]),
  );

  const users = new Map<string, Set<string>>(
    doors
      .filter((door) => door !== base && isWithin(door, base))
      .map((door) => [door, new Set()]),
  );
  for (const { from, to, by } of excepted) {
    if (by !== 'door') continue;
    let deepest: string | undefined;
    for (const door of users.keys())
      if (
        isWithin(to, door) &&
        (deepest === undefined || door.length > deepest.length)
      )
        deepest = door;
    if (deepest !== undefined) users.get(deepest)?.add(parentOf(from));
  }

  const leaves = leavesOf(base, files, links);
  return {
    folders: new Set([...leaves, ...found.keys()]).size,
    leaves,
    reaches,
    doors: new Map([...users].map(([door, using]) => [door, using.size])),
  };
}
