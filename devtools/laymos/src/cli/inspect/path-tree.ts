import * as colors from 'yoctocolors';

export type PathTreeEntryKind =
  | 'direct'
  | 'recursive'
  | 'dependent'
  | 'dependency';

export interface PathTreeEntry {
  readonly path: string;
  readonly kind: PathTreeEntryKind;
}

type PathTreeNodeKind = 'active' | PathTreeEntryKind;

interface PathTreeNode {
  readonly name: string;
  readonly kind?: PathTreeNodeKind | undefined;
  readonly children: readonly PathTreeNode[];
}

interface MutablePathTreeNode {
  kind?: PathTreeNodeKind;
  readonly children: Map<string, MutablePathTreeNode>;
}

export function renderPathTree(
  target: string,
  entries: readonly PathTreeEntry[],
): string {
  return renderRoot(groupByPath(target, entries)).join('\n');
}

function groupByPath(
  target: string,
  entries: readonly PathTreeEntry[],
): readonly PathTreeNode[] {
  const root: MutablePathTreeNode = { children: new Map() };
  insertPath(root, target.split('/'), 'active');
  for (const entry of entries) {
    insertPath(root, entry.path.split('/'), entry.kind);
  }
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
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, child]) => ({
      name,
      kind: child.kind,
      children: freeze(child),
    }));
}

function renderRoot(nodes: readonly PathTreeNode[]): string[] {
  if (nodes.length !== 1) return renderNodes(nodes, '');
  const root = nodes[0]!;
  return [renderLabel(root), ...renderNodes(root.children, '')];
}

function renderNodes(nodes: readonly PathTreeNode[], prefix: string): string[] {
  return nodes.flatMap((node, index) => {
    const isLast = index === nodes.length - 1;
    const childPrefix = prefix + (isLast ? '    ' : '│   ');
    return [
      `${prefix}${isLast ? '└── ' : '├── '}${renderLabel(node)}`,
      ...renderNodes(node.children, childPrefix),
    ];
  });
}

function renderLabel(node: PathTreeNode): string {
  if (node.kind === undefined) return node.name;
  if (node.kind === 'active') return colors.green(node.name);
  if (node.kind === 'dependent') return colors.cyan(node.name);
  if (node.kind === 'recursive') return colors.gray(node.name);
  return colors.yellow(node.name);
}
