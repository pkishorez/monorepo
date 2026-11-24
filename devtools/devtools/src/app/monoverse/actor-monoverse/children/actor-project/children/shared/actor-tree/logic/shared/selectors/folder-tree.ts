import { isWithin } from '../../../../../../../../../server/rpc/contract/index.js';
import {
  ancestorsOf,
  nameOf,
  type Change,
} from '../../../../../../logic/shared/index.js';

/*
 * The folder tree Monoverse draws: the real folders on disk, built from
 * the files in them. A Package in the repo view is one leaf of its own,
 * standing for its whole folder.
 */

type NodeKind = 'folder' | 'file' | 'package';

export interface TreeNode {
  readonly path: string;
  readonly name: string;
  readonly kind: NodeKind;
  /** A Package's name, which may differ from its folder's. */
  readonly label?: string;
  /** A Package's version, when it has one. */
  readonly version?: string;
  readonly children: ReadonlyArray<TreeNode>;
}

/** What the tree is built from: a file, or a Package standing for its folder. */
export interface Leaf {
  readonly path: string;
  readonly kind: 'file' | 'package';
  readonly label?: string;
  readonly version?: string;
}

/** The tree with every node findable by its path. */
export interface FolderTree {
  /** The folder the tree is rooted at; never drawn itself. */
  readonly root: TreeNode;
  readonly nodes: ReadonlyMap<string, TreeNode>;
}

interface Draft {
  path: string;
  name: string;
  kind: NodeKind;
  label?: string;
  version?: string;
  children: Map<string, Draft>;
}

/**
 * The tree of `leaves` under `base`: one folder per path segment between
 * them, folders and Packages first, then files, each by name; the root
 * named `label`, when given. Leaves
 * outside `base` are left out, as is anything inside a Package.
 */
export function buildTree(
  base: string,
  leaves: Iterable<Leaf>,
  /** What the root stands for, by name: the project, or the Package. */
  label?: string,
): FolderTree {
  const top: Draft = {
    path: base,
    name: nameOf(base),
    kind: 'folder',
    ...(label === undefined ? {} : { label }),
    children: new Map(),
  };
  for (const leaf of leaves) {
    if (leaf.path === base || !isWithin(leaf.path, base)) continue;
    const rest = base === '' ? leaf.path : leaf.path.slice(base.length + 1);
    const segments = rest.split('/');
    let at = top;
    let path = base;
    let inside = true;
    for (const segment of segments.slice(0, -1)) {
      path = path === '' ? segment : `${path}/${segment}`;
      let next = at.children.get(segment);
      if (next === undefined) {
        next = { path, name: segment, kind: 'folder', children: new Map() };
        at.children.set(segment, next);
      }
      if (next.kind !== 'folder') {
        inside = false;
        break;
      }
      at = next;
    }
    if (!inside) continue;
    const name = segments.at(-1)!;
    const existing = at.children.get(name);
    if (existing !== undefined && existing.kind === 'folder') {
      // A Package takes over the folder its files would have made.
      if (leaf.kind === 'package') existing.children.clear();
      else continue;
    }
    at.children.set(name, {
      path: leaf.path,
      name,
      kind: leaf.kind,
      ...(leaf.label === undefined ? {} : { label: leaf.label }),
      ...(leaf.version === undefined ? {} : { version: leaf.version }),
      children: new Map(),
    });
  }
  const nodes = new Map<string, TreeNode>();
  const freeze = (draft: Draft): TreeNode => {
    const node: TreeNode = {
      path: draft.path,
      name: draft.name,
      kind: draft.kind,
      ...(draft.label === undefined ? {} : { label: draft.label }),
      ...(draft.version === undefined ? {} : { version: draft.version }),
      children: [...draft.children.values()].sort(byKind).map(freeze),
    };
    nodes.set(node.path, node);
    return node;
  };
  return { root: freeze(top), nodes };
}

const byKind = (left: Draft, right: Draft) => {
  const rank = (draft: Draft) => (draft.kind === 'file' ? 1 : 0);
  return rank(left) - rank(right) || left.name.localeCompare(right.name);
};

export interface Row {
  readonly node: TreeNode;
  /** 0 for the nodes directly in the root. */
  readonly depth: number;
}

/**
 * The nodes on screen, top to bottom: everything in the root, and inside
 * every folder `isOpen` says is open, less what `shown` leaves out.
 */
export function visibleRows(
  tree: FolderTree,
  isOpen: (path: string) => boolean,
  shown: (node: TreeNode) => boolean = () => true,
): ReadonlyArray<Row> {
  const rows: Array<Row> = [];
  const walk = (node: TreeNode, depth: number) => {
    for (const child of node.children) {
      if (!shown(child)) continue;
      rows.push({ node: child, depth });
      if (child.kind === 'folder' && isOpen(child.path)) walk(child, depth + 1);
    }
  };
  walk(tree.root, 0);
  return rows;
}

/**
 * The node on screen that holds `path`: the path itself when every folder
 * above it is open, else the outermost closed folder on the way down.
 * Nothing for a path the tree does not hold.
 */
export function visibleOf(
  tree: FolderTree,
  isOpen: (path: string) => boolean,
  path: string,
): string | undefined {
  const base = tree.root.path;
  if (path === base || !isWithin(path, base)) return undefined;
  const chain = [path, ...ancestorsOf(path)]
    .filter((folder) => folder !== base && isWithin(folder, base))
    .reverse();
  for (const at of chain) {
    const node = tree.nodes.get(at);
    if (node === undefined) return undefined;
    if (at === path) return at;
    if (node.kind !== 'folder' || !isOpen(at)) return at;
  }
  return undefined;
}

/** The files to draw: those on disk, and the deleted ones where they stood. */
export function withDeleted(
  files: ReadonlyArray<string>,
  changes: ReadonlyArray<Change> | null,
): ReadonlyArray<string> {
  if (changes === null) return files;
  const present = new Set(files);
  const deleted = changes
    .filter(({ status, path }) => status === 'deleted' && !present.has(path))
    .map(({ path }) => path);
  return deleted.length === 0 ? files : [...files, ...deleted];
}
