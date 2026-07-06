import type { ModuleNode } from '../modules';

/**
 * A module rendered as a leaf row. `label` is the module's basename (its last
 * path segment, extension included for file modules).
 */
export type ModuleLeafNode = {
  kind: 'module';
  label: string;
  module: ModuleNode;
  /** Declared in `config.modules` (vs discovered from coverage). */
  declared: boolean;
};

/**
 * A folder placeholder: display-only structure grouping the modules beneath it.
 * `label` may span multiple segments when a single-child folder chain is
 * collapsed (`a/b` when `a` holds only `b`).
 */
export type ModuleFolderNode = {
  kind: 'folder';
  label: string;
  children: ModuleTreeNode[];
};

export type ModuleTreeNode = ModuleLeafNode | ModuleFolderNode;

type FolderBuild = {
  label: string;
  folders: Map<string, FolderBuild>;
  modules: ModuleLeafNode[];
};

/**
 * Turns a layer's flat module list into a folder tree: each module sits under
 * the folder chain of its path, folders are display-only placeholders, and a
 * single-child folder chain collapses into one `a/b` row. Within a folder,
 * modules come first (declared before discovered, each alphabetical), then
 * subfolders (alphabetical).
 */
export function buildModuleTree(
  modules: ModuleNode[],
  declaredKeys: ReadonlySet<string>,
): ModuleTreeNode[] {
  const root: FolderBuild = { label: '', folders: new Map(), modules: [] };

  for (const mod of modules) {
    const leaf: ModuleLeafNode = {
      kind: 'module',
      label: mod.name === '' ? '(layer root)' : basename(mod.name),
      module: mod,
      declared: declaredKeys.has(mod.key),
    };
    const folderSegments =
      mod.name === '' ? [] : mod.name.split('/').slice(0, -1);
    let cursor = root;
    for (const segment of folderSegments) {
      let next = cursor.folders.get(segment);
      if (!next) {
        next = { label: segment, folders: new Map(), modules: [] };
        cursor.folders.set(segment, next);
      }
      cursor = next;
    }
    cursor.modules.push(leaf);
  }

  return toNodes(root);
}

function toNodes(build: FolderBuild): ModuleTreeNode[] {
  const modules = [...build.modules].sort(declaredFirst);
  const folders = [...build.folders.values()]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map(compressFolder);
  return [...modules, ...folders];
}

/** Collapse a chain of single-subfolder folders (`a` → `a/b`) into one node. */
function compressFolder(build: FolderBuild): ModuleFolderNode {
  let label = build.label;
  let cursor = build;
  while (cursor.modules.length === 0 && cursor.folders.size === 1) {
    const [only] = cursor.folders.values();
    label = `${label}/${only!.label}`;
    cursor = only!;
  }
  return { kind: 'folder', label, children: toNodes(cursor) };
}

function declaredFirst(a: ModuleLeafNode, b: ModuleLeafNode): number {
  return a.declared === b.declared
    ? a.label.localeCompare(b.label)
    : a.declared
      ? -1
      : 1;
}

function basename(name: string): string {
  return name.slice(name.lastIndexOf('/') + 1);
}

/**
 * Module keys of a node and all its descendants — used to decide whether a
 * folder or collapsed overflow contains a highlighted module.
 */
export function moduleTreeKeys(node: ModuleTreeNode): string[] {
  return node.kind === 'module'
    ? [node.module.key]
    : node.children.flatMap(moduleTreeKeys);
}
