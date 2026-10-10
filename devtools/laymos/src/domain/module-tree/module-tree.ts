import { posix } from 'node:path';

import type {
  ModuleTree,
  TreeNode,
} from '../../architecture-analysis-schema/index.js';

export const indexFileNames = new Set([
  'index.ts',
  'index.tsx',
  'index.js',
  'index.jsx',
  'index.mjs',
  'index.cjs',
]);

export const rootPath = '.';

/**
 * Reads the Module tree out of a file list. A folder holding an index file
 * is a Module; a declared File Module is a Module; every folder between the
 * root and a Module is a Wrapper. Each analyzed file is owned by the nearest
 * Module above it, or by the Wrapper it sits in when no Module is above.
 */
export function buildModuleTree(
  files: Iterable<string>,
  fileModules: Iterable<string>,
): ModuleTree {
  const analyzed = [...new Set(files)].sort();
  const declaredFiles = new Set(fileModules);
  const moduleFolders = new Set<string>();
  const indexOf = new Map<string, string>();
  for (const file of analyzed) {
    if (!indexFileNames.has(posix.basename(file))) continue;
    const folder = posix.dirname(file);
    if (!indexOf.has(folder)) {
      moduleFolders.add(folder);
      indexOf.set(folder, file);
    }
  }

  const nodes = new Map<string, MutableNode>();
  const ensure = (path: string): MutableNode => {
    const existing = nodes.get(path);
    if (existing !== undefined) return existing;
    const node: MutableNode = {
      path,
      kind: moduleFolders.has(path) ? 'module' : 'wrapper',
      shape: 'folder',
      index: indexOf.get(path),
      ownFiles: [],
      parent: path === rootPath ? undefined : posix.dirname(path),
      children: new Set(),
    };
    nodes.set(path, node);
    if (node.parent !== undefined) ensure(node.parent).children.add(path);
    return node;
  };
  ensure(rootPath);

  const owners: Record<string, string> = {};
  for (const file of analyzed) {
    const folder = posix.dirname(file);
    if (declaredFiles.has(file)) {
      const node: MutableNode = {
        path: file,
        kind: 'module',
        shape: 'file',
        index: file,
        ownFiles: [file],
        parent: folder,
        children: new Set(),
      };
      nodes.set(file, node);
      ensure(folder).children.add(file);
      owners[file] = file;
      continue;
    }
    const owner = nearestModuleFolder(folder, moduleFolders) ?? folder;
    ensure(owner).ownFiles.push(file);
    owners[file] = owner;
  }

  return {
    root: rootPath,
    nodes: [...nodes.values()]
      .sort((left, right) => left.path.localeCompare(right.path))
      .map(freeze),
    owners,
  };
}

export function nodeByPath(
  tree: ModuleTree,
  path: string,
): TreeNode | undefined {
  return tree.nodes.find((node) => node.path === path);
}

export function isAncestor(ancestor: string, path: string): boolean {
  return ancestor === rootPath
    ? path !== rootPath
    : path.startsWith(`${ancestor}/`);
}

/** Every node from `path` up to the root, nearest first. */
export function ancestorsOf(tree: ModuleTree, path: string): readonly string[] {
  const ancestors: string[] = [];
  let current = nodeByPath(tree, path)?.parent;
  while (current !== undefined) {
    ancestors.push(current);
    current = nodeByPath(tree, current)?.parent;
  }
  return ancestors;
}

/** Every Module at or below `path`, in path order. */
export function modulesWithin(
  tree: ModuleTree,
  path: string,
): readonly TreeNode[] {
  return tree.nodes.filter(
    (node) =>
      node.kind === 'module' &&
      (node.path === path || isAncestor(path, node.path)),
  );
}

interface MutableNode {
  readonly path: string;
  readonly kind: TreeNode['kind'];
  readonly shape: TreeNode['shape'];
  readonly index: string | undefined;
  readonly ownFiles: string[];
  readonly parent: string | undefined;
  readonly children: Set<string>;
}

function freeze(node: MutableNode): TreeNode {
  return {
    path: node.path,
    kind: node.kind,
    shape: node.shape,
    ...(node.index === undefined ? {} : { index: node.index }),
    ownFiles: [...node.ownFiles].sort(),
    ...(node.parent === undefined ? {} : { parent: node.parent }),
    children: [...node.children].sort(),
  };
}

function nearestModuleFolder(
  folder: string,
  moduleFolders: ReadonlySet<string>,
): string | undefined {
  let current = folder;
  while (true) {
    if (moduleFolders.has(current)) return current;
    if (current === rootPath) return undefined;
    current = posix.dirname(current);
  }
}
