import {
  isGraphSource,
  isWithin,
} from '../../../../../../../../../server/rpc/contract/index.js';
import type { Link } from '../../../../../../../../../services/projects/contract/index.js';
import type {
  ConnectionKind,
  Shown,
} from '../../../../../../../../logic/shared/index.js';
import { ancestorsOf } from '../../../../../../logic/shared/index.js';

export interface Connection {
  readonly uses: number;
  readonly usedBy: number;
  readonly broken: number;
  readonly excepted: number;
}

export interface LinkKinds {
  readonly broken: ReadonlySet<string>;
  readonly excepted: ReadonlySet<string>;
}

export const linkKey = ([from, to]: Link) => `${from}\0${to}`;

export const kindOf = (link: Link, kinds: LinkKinds): ConnectionKind => {
  const key = linkKey(link);
  if (kinds.broken.has(key)) return 'violations';
  if (kinds.excepted.has(key)) return 'exceptions';
  return 'allowed';
};

export const shownLinks = (
  links: ReadonlyArray<Link>,
  kinds: LinkKinds,
  shown: Shown,
): ReadonlyArray<Link> =>
  shown.violations && shown.exceptions && shown.allowed
    ? links
    : links.filter((link) => shown[kindOf(link, kinds)]);

const crossing = (link: Link, folder: string) => {
  const [from, to] = link;
  const fromInside = isWithin(from, folder);
  if (fromInside === isWithin(to, folder)) return null;
  return { fromInside, far: fromInside ? to : from };
};

export function connectionsOf(
  selected: string,
  links: ReadonlyArray<Link>,
  place: (path: string) => string | undefined,
  kinds: LinkKinds,
): ReadonlyMap<string, Connection> {
  const found = new Map<
    string,
    {
      uses: Set<string>;
      usedBy: Set<string>;
      broken: Set<string>;
      excepted: Set<string>;
    }
  >();
  const at = (node: string) => {
    let entry = found.get(node);
    if (entry === undefined) {
      entry = {
        uses: new Set(),
        usedBy: new Set(),
        broken: new Set(),
        excepted: new Set(),
      };
      found.set(node, entry);
    }
    return entry;
  };
  for (const link of links) {
    const crossed = crossing(link, selected);
    if (crossed === null) continue;
    const { fromInside, far } = crossed;
    const node = place(far);
    if (node === undefined) continue;
    const entry = at(node);
    (fromInside ? entry.uses : entry.usedBy).add(far);
    const kind = kindOf(link, kinds);
    if (kind === 'violations') entry.broken.add(far);
    if (kind === 'exceptions') entry.excepted.add(far);
  }
  return new Map(
    [...found].map(([node, entry]) => [
      node,
      {
        uses: entry.uses.size,
        usedBy: entry.usedBy.size,
        broken: entry.broken.size,
        excepted: entry.excepted.size,
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
  for (const link of links) {
    const crossed = crossing(link, selected);
    if (crossed === null) continue;
    const { far } = crossed;
    if (!isWithin(far, folder) || far === folder) continue;
    for (const at of ancestorsOf(far)) {
      if (at === folder || !isWithin(at, folder)) break;
      folders.add(at);
    }
  }
  return [...folders].sort();
}

export function leavesOf(
  base: string,
  files: ReadonlyArray<string>,
  links: ReadonlyArray<Link>,
): ReadonlySet<string> {
  const foldersOf = (path: string, other: string | null) => {
    const folders: Array<string> = [];
    for (const at of ancestorsOf(path)) {
      if (at === base || !isWithin(at, base)) break;
      if (other !== null && isWithin(other, at)) break;
      folders.push(at);
    }
    return folders;
  };
  const holding = new Set(
    files.filter(isGraphSource).flatMap((path) => foldersOf(path, null)),
  );
  const using = new Set(links.flatMap(([from, to]) => foldersOf(from, to)));
  return new Set([...holding].filter((folder) => !using.has(folder)));
}

export function foldersAround(
  focus: string,
  base: string,
  links: ReadonlyArray<Link>,
): ReadonlyArray<string> {
  const folders = new Set<string>();
  for (const link of links) {
    const crossed = crossing(link, focus);
    if (crossed === null) continue;
    for (const at of ancestorsOf(crossed.far)) {
      if (at === base || !isWithin(at, base)) break;
      folders.add(at);
    }
  }
  return [...folders].sort();
}

export function focusedFiles(
  focus: string,
  files: ReadonlyArray<string>,
  links: ReadonlyArray<Link>,
  outside: boolean,
): ReadonlyArray<string> {
  const inside = files.filter((path) => isWithin(path, focus));
  if (!outside) return inside;
  const far = new Set<string>();
  for (const link of links) {
    const crossed = crossing(link, focus);
    if (crossed !== null) far.add(crossed.far);
  }
  return [...inside, ...files.filter((path) => far.has(path))];
}
