export type FileGraph = ReadonlyMap<string, readonly string[]>;

export interface DependencyEntry {
  readonly path: string;
  readonly kind: 'direct' | 'recursive';
}

export interface DependencyQueryOptions {
  readonly recursive?: boolean;
}

export function fileDependencies(
  graph: FileGraph,
  path: string,
  options: DependencyQueryOptions = {},
): readonly DependencyEntry[] {
  return dependenciesOutside(graph, [path], path, options.recursive ?? false);
}

export function folderDependencies(
  graph: FileGraph,
  folder: string,
  options: DependencyQueryOptions = {},
): readonly DependencyEntry[] {
  const members = [...graph.keys()].filter((path) => isWithin(folder, path));
  return dependenciesOutside(
    graph,
    members,
    folder,
    options.recursive ?? false,
  );
}

function dependenciesOutside(
  graph: FileGraph,
  seeds: readonly string[],
  target: string,
  recursive: boolean,
): readonly DependencyEntry[] {
  const entries = new Map<string, 'direct' | 'recursive'>();
  const direct = new Set<string>();

  for (const seed of seeds) {
    for (const dep of graph.get(seed) ?? []) {
      if (isWithin(target, dep)) continue;
      direct.add(dep);
      entries.set(dep, 'direct');
    }
  }

  if (recursive) {
    let frontier = [...direct];
    const visited = new Set(direct);
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const path of frontier) {
        for (const dep of graph.get(path) ?? []) {
          if (isWithin(target, dep) || visited.has(dep)) continue;
          visited.add(dep);
          entries.set(dep, 'recursive');
          next.push(dep);
        }
      }
      frontier = next;
    }
  }

  return [...entries.entries()]
    .sort(([pathA, kindA], [pathB, kindB]) =>
      kindA === kindB
        ? pathA.localeCompare(pathB)
        : kindA === 'direct'
          ? -1
          : 1,
    )
    .map(([path, kind]) => ({ path, kind }));
}

function isWithin(target: string, path: string): boolean {
  return target === '.' || path === target || path.startsWith(`${target}/`);
}

export type PathTreeNodeKind = 'target' | DependencyEntry['kind'];

export interface PathTreeNode {
  readonly name: string;
  readonly kind?: PathTreeNodeKind | undefined;
  readonly children: readonly PathTreeNode[];
}

interface MutablePathTreeNode {
  kind?: PathTreeNodeKind;
  readonly children: Map<string, MutablePathTreeNode>;
}

export function groupByPath(
  target: string,
  entries: readonly DependencyEntry[],
): readonly PathTreeNode[] {
  const root: MutablePathTreeNode = { children: new Map() };
  insertPath(root, target.split('/'), 'target');
  for (const entry of entries)
    insertPath(root, entry.path.split('/'), entry.kind);
  return freeze(root);
}

function insertPath(
  node: MutablePathTreeNode,
  segments: readonly string[],
  kind: PathTreeNodeKind,
): void {
  const [segment, ...rest] = segments;
  if (segment === undefined) return;
  let child = node.children.get(segment);
  if (child === undefined) {
    child = { children: new Map() };
    node.children.set(segment, child);
  }
  if (rest.length === 0) child.kind = kind;
  else insertPath(child, rest, kind);
}

function freeze(node: MutablePathTreeNode): readonly PathTreeNode[] {
  return [...node.children.entries()]
    .sort(([nameA], [nameB]) => nameA.localeCompare(nameB))
    .map(([name, child]) => ({
      name,
      kind: child.kind,
      children: freeze(child),
    }));
}
