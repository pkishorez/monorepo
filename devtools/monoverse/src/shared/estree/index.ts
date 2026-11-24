/*
 * The few things the rules read of a parsed file, as ESTree: oxlint
 * hands the lint its nodes, oxc-parser hands the DevTools theirs, and
 * both are ESTree, so one reading serves both.
 */

/** An ESTree node, from oxlint or oxc-parser. */
export interface EsNode {
  readonly type: string;
}

/** The value a node holds under `key`. */
export const fieldOf = (node: EsNode, key: string): unknown =>
  (node as unknown as Readonly<Record<string, unknown>>)[key];

/** Whether `value` is an ESTree node. */
export const isNode = (value: unknown): value is EsNode =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { type?: unknown }).type === 'string';

/** The node under `key`, when there is one. */
export const nodeOf = (node: EsNode, key: string): EsNode | undefined => {
  const value = fieldOf(node, key);
  return isNode(value) ? value : undefined;
};

/** The nodes in the list under `key`. */
export const nodesOf = (node: EsNode, key: string): readonly EsNode[] => {
  const value = fieldOf(node, key);
  return Array.isArray(value) ? value.filter(isNode) : [];
};

/** The text a string literal holds, when `node` is one. */
export const stringOf = (node: EsNode | undefined): string | undefined => {
  if (node?.type !== 'Literal') return undefined;
  const value = fieldOf(node, 'value');
  return typeof value === 'string' ? value : undefined;
};

/** Every node in `root`, itself included, parents before children, in source order. */
export const walk = (root: EsNode, visit: (node: EsNode) => void): void => {
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const value = stack.pop();
    if (Array.isArray(value)) {
      for (let i = value.length - 1; i >= 0; i--) stack.push(value[i]);
      continue;
    }
    if (!isNode(value)) continue;
    visit(value);
    const children = Object.entries(value)
      .filter(([key, child]) => key !== 'parent' && typeof child === 'object')
      .map(([, child]) => child);
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
  }
};
