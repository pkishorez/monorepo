import type { ModuleTree, TreeNode } from 'laymos';

export type CardKind = 'module' | 'file-module' | 'wrapper';

/**
 * One card of the Laymo: a Module or Wrapper of the tree, or a Wrapper chain
 * with one child collapsed into the card of that child. `node` is the
 * deepest node of the chain, whose children the card shows; `chain` lists
 * every node folded into it, top first.
 */
export interface LaymoNode {
  /** The path of `node`: what the card is keyed and focused by. */
  readonly key: string;
  /** What the card is called: its path relative to the card above it. */
  readonly title: string;
  readonly kind: CardKind;
  /**
   * A Module the Change set deleted, shown where it stood, or a Wrapper
   * whose every child was deleted.
   */
  readonly deleted: boolean;
  readonly node: TreeNode;
  readonly chain: readonly TreeNode[];
  readonly parentKey: string | null;
  readonly children: readonly LaymoNode[];
}

export interface LaymoTree {
  readonly root: LaymoNode;
  readonly byKey: ReadonlyMap<string, LaymoNode>;
}

const kindOf = (node: TreeNode): CardKind =>
  node.kind === 'wrapper'
    ? 'wrapper'
    : node.shape === 'file'
      ? 'file-module'
      : 'module';

/** Whether `path` is `folder` or lies beneath it; the root holds everything. */
export function contains(folder: string, path: string): boolean {
  return folder === '.' || path === folder || path.startsWith(`${folder}/`);
}

/** The path of the chain's top node: everything in the card lies beneath it. */
export const topPathOf = (node: LaymoNode) => node.chain[0]!.path;

/**
 * The tree with every deleted folder Module put back where it stood, with
 * the folders between it and the deepest node still standing put back as
 * deleted Wrappers, so what a change took away keeps its shape. Returns the
 * paths it put back.
 */
function withDeleted(
  tree: ModuleTree,
  deleted: readonly string[],
): { readonly tree: ModuleTree; readonly gone: ReadonlySet<string> } {
  const gone = new Set<string>();
  if (deleted.length === 0) return { tree, gone };
  const nodes = new Map(
    tree.nodes.map((node) => [
      node.path,
      { ...node, children: [...node.children] },
    ]),
  );
  const modules = new Set(deleted);
  for (const path of [...deleted].sort((a, b) => a.length - b.length)) {
    if (nodes.has(path)) continue;
    let parent = nodes.get(tree.root)!;
    for (const node of nodes.values())
      if (
        contains(node.path, path) &&
        node.path !== path &&
        node.path.length > parent.path.length
      )
        parent = node;
    const start = parent.path === '.' ? 0 : parent.path.split('/').length;
    const segments = path.split('/');
    for (let depth = start + 1; depth <= segments.length; depth += 1) {
      const folder = segments.slice(0, depth).join('/');
      const isModule = modules.has(folder);
      const node = {
        path: folder,
        kind: isModule ? ('module' as const) : ('wrapper' as const),
        shape: 'folder' as const,
        ...(isModule ? { index: `${folder}/index.ts` } : {}),
        ownFiles: [],
        parent: parent.path,
        children: [] as string[],
      };
      nodes.set(folder, node);
      parent.children.push(folder);
      gone.add(folder);
      parent = node;
    }
  }
  return { tree: { ...tree, nodes: [...nodes.values()] }, gone };
}

/**
 * Builds the card tree: every node a card, one-child Wrapper chains folded,
 * and the `deleted` Modules back where they stood.
 */
export function buildLaymoTree(
  moduleTree: ModuleTree,
  deleted: readonly string[] = [],
): LaymoTree {
  const { tree, gone } = withDeleted(moduleTree, deleted);
  const nodes = new Map(tree.nodes.map((node) => [node.path, node]));
  const byKey = new Map<string, LaymoNode>();
  const build = (
    top: TreeNode,
    parent: LaymoNode | null,
    isRoot: boolean,
  ): LaymoNode => {
    const chain = [top];
    let deepest = top;
    // A plain Wrapper with one child has no face of its own: it folds into
    // that child. The Project card never folds, so the Project stays one card.
    while (
      !isRoot &&
      deepest.kind === 'wrapper' &&
      deepest.children.length === 1
    ) {
      const only = nodes.get(deepest.children[0]!);
      if (only === undefined) break;
      chain.push(only);
      deepest = only;
    }
    const parentPath = parent === null ? null : parent.node.path;
    const title =
      parentPath === null || parentPath === '.'
        ? deepest.path
        : deepest.path.startsWith(`${parentPath}/`)
          ? deepest.path.slice(parentPath.length + 1)
          : deepest.path;
    const card: {
      -readonly [K in keyof LaymoNode]: LaymoNode[K];
    } = {
      key: deepest.path,
      title,
      kind: kindOf(deepest),
      deleted: gone.has(deepest.path),
      node: deepest,
      chain,
      parentKey: parent?.key ?? null,
      children: [],
    };
    card.children = deepest.children.flatMap((path) => {
      const child = nodes.get(path);
      return child === undefined ? [] : [build(child, card, false)];
    });
    // A Wrapper whose every child was deleted went with them.
    if (
      card.kind === 'wrapper' &&
      card.children.length > 0 &&
      card.children.every((child) => child.deleted)
    )
      card.deleted = true;
    byKey.set(card.key, card);
    return card;
  };
  const rootNode = nodes.get(tree.root) ?? tree.nodes[0]!;
  return { root: build(rootNode, null, true), byKey };
}

/** The deepest card holding `path`, walking only through cards `shown` admits. */
export function cardHolding(
  tree: LaymoTree,
  path: string,
  shown: (card: LaymoNode) => boolean = () => true,
): LaymoNode {
  let current = tree.root;
  for (;;) {
    if (!shown(current)) return current;
    const child = current.children.find((child) =>
      contains(topPathOf(child), path),
    );
    if (child === undefined) return current;
    current = child;
  }
}

/** The cards from the root down to `key`, inclusive. */
export function pathTo(tree: LaymoTree, key: string): readonly LaymoNode[] {
  const path: LaymoNode[] = [];
  for (
    let card = tree.byKey.get(key);
    card !== undefined;
    card = card.parentKey === null ? undefined : tree.byKey.get(card.parentKey)
  )
    path.unshift(card);
  return path;
}

/** The open cards after opening `key`: those open already, its ancestors and itself. */
export function openDownTo(
  tree: LaymoTree,
  key: string,
  open: ReadonlySet<string> = new Set(),
): ReadonlySet<string> {
  return new Set([...open, ...pathTo(tree, key).map((card) => card.key)]);
}

/** The open cards after collapsing `key`: every other open card but those inside it. */
export function collapseAt(
  tree: LaymoTree,
  key: string,
  open: ReadonlySet<string>,
): ReadonlySet<string> {
  return new Set(
    [...open].filter((other) => other !== key && !isAncestor(tree, key, other)),
  );
}

export function isAncestor(
  tree: LaymoTree,
  ancestorKey: string,
  key: string,
): boolean {
  for (
    let card = tree.byKey.get(key);
    card !== undefined && card.parentKey !== null;
    card = tree.byKey.get(card.parentKey)
  )
    if (card.parentKey === ancestorKey) return true;
  return false;
}

/**
 * The tree keeping only the cards `keep` admits and the cards holding them;
 * the Project card always stays.
 */
export function pruneLaymoTree(
  tree: LaymoTree,
  keep: (card: LaymoNode) => boolean,
): LaymoTree {
  const byKey = new Map<string, LaymoNode>();
  const prune = (card: LaymoNode, isRoot: boolean): LaymoNode | undefined => {
    const children = card.children.flatMap((child) => {
      const kept = prune(child, false);
      return kept === undefined ? [] : [kept];
    });
    if (!isRoot && children.length === 0 && !keep(card)) return undefined;
    const kept = { ...card, children };
    byKey.set(kept.key, kept);
    return kept;
  };
  return { root: prune(tree.root, true)!, byKey };
}
