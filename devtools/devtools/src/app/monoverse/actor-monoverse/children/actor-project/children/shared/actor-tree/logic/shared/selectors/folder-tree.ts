import { isWithin } from '../../../../../../../../../server/rpc/contract/index.js';
import {
  ancestorsOf,
  nameOf,
  type Change,
} from '../../../../../../logic/shared/index.js';

type NodeKind = 'folder' | 'file' | 'package';

export interface TreeNode {
  readonly path: string;
  readonly name: string;
  readonly kind: NodeKind;
  readonly label?: string;
  readonly version?: string;
  readonly children: ReadonlyArray<TreeNode>;
}

export interface Leaf {
  readonly path: string;
  readonly kind: 'file' | 'package';
  readonly label?: string;
  readonly version?: string;
}

export interface FolderTree {
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

export function buildTree(
  base: string,
  leaves: Iterable<Leaf>,
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
  readonly depth: number;
}

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
