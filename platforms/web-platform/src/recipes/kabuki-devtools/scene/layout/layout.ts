import { outline } from './outline.ts';
import type { Branch, Laid } from './shapes.ts';
import { packedTree } from './tree.ts';

/*
 * Laying a tree of boxes out, one of two ways: a packed tree, top-down, or
 * an outline, indented. Both are pure, depend on the boxes alone, and give
 * placed boxes, the lines between them, and the labels on those lines.
 */

export type Kind = 'tree' | 'outline';

export const layout = (root: Branch, kind: Kind): Laid =>
  kind === 'tree' ? packedTree(root) : outline(root);
