import type { Layer } from '../model';

export interface ScopeNode {
  readonly name: string;
  readonly path: string;
  readonly layerId?: string;
  readonly fileCount?: number;
  readonly children: readonly ScopeNode[];
}

interface MutableScopeNode {
  readonly name: string;
  readonly path: string;
  layerId?: string;
  fileCount?: number;
  readonly children: Map<string, MutableScopeNode>;
}

export function buildScopeHierarchy(
  layers: readonly Layer[],
): readonly ScopeNode[] {
  const root = new Map<string, MutableScopeNode>();

  for (const layer of layers) {
    for (const scope of layer.scopes) {
      addScope(root, layer.id, scope.path, scope.fileCount);
    }
  }

  return freezeNodes(root);
}

function addScope(
  root: Map<string, MutableScopeNode>,
  layerId: string,
  path: string,
  fileCount: number,
) {
  const segments = path.split('/').filter(Boolean);
  let children = root;
  let currentPath = '';

  for (const segment of segments) {
    currentPath = currentPath === '' ? segment : `${currentPath}/${segment}`;
    let node = children.get(segment);
    if (node === undefined) {
      node = { name: segment, path: currentPath, children: new Map() };
      children.set(segment, node);
    }
    children = node.children;
    if (currentPath === path) {
      node.layerId = layerId;
      node.fileCount = fileCount;
    }
  }
}

function freezeNodes(
  nodes: ReadonlyMap<string, MutableScopeNode>,
): readonly ScopeNode[] {
  return [...nodes.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((node) => ({
      name: node.name,
      path: node.path,
      ...(node.layerId === undefined ? {} : { layerId: node.layerId }),
      ...(node.fileCount === undefined ? {} : { fileCount: node.fileCount }),
      children: freezeNodes(node.children),
    }));
}
