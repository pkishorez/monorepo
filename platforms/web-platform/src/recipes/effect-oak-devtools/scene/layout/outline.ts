import { curve } from './shapes.ts';
import type { Box, Branch, Label, Laid, Line } from './shapes.ts';

/*
 * An outline, top to bottom, like a tree of files: one box under another,
 * each child indented under its parent, the root's top-left at 0, 0.
 *
 * 1. Rows    each box on its own row, in order.
 * 2. Groups  children led to by the same thing sit under one label row,
 *            indented once more; the rest straight under their parent.
 * 3. Lines   down a spine from each box, then across to each child or label.
 */

const INDENT = 28;
const GAP = 10;
const LABEL = 20;
/** Where on a box its line arrives: level with its name. */
const ARRIVE = 21;

export const outline = (root: Branch): Laid => {
  const boxes = new Map<string, Box>();
  const lines: Line[] = [];
  const labels: Label[] = [];
  let y = 0;

  const visit = (branch: Branch, x: number, depth: number, parent?: string) => {
    // 1. Rows
    boxes.set(branch.id, {
      x,
      y,
      width: branch.width,
      height: branch.height,
      depth,
      ...(parent ? { parent } : {}),
    });
    const spine = { x: x + 14, y: y + branch.height };
    y += branch.height + GAP;

    // 2. Groups
    let group:
      | { readonly via: string; readonly spine: { x: number; y: number } }
      | undefined;
    for (const { via, branch: child } of branch.children) {
      if (via && via !== group?.via) {
        const labelX = x + INDENT;
        labels.push({
          id: `${branch.id}:${via}`,
          owner: branch.id,
          text: via,
          x: labelX,
          y: y + LABEL / 2,
          align: 'start',
        });
        lines.push({
          id: `${branch.id}->${via}`,
          from: branch.id,
          to: branch.id,
          via,
          d: curve(spine, { x: labelX - 4, y: y + LABEL / 2 }, 'across'),
        });
        group = { via, spine: { x: labelX + 6, y: y + LABEL } };
        y += LABEL + GAP / 2;
      }
      if (!via) group = undefined;
      const from = group && via ? group.spine : spine;
      const childX = from.x + INDENT - 14;
      // 3. Lines
      lines.push({
        id: `${branch.id}->${child.id}`,
        from: branch.id,
        to: child.id,
        ...(via ? { via } : {}),
        d: curve(from, { x: childX, y: y + ARRIVE }, 'across'),
      });
      visit(child, childX, depth + 1, branch.id);
    }
  };
  visit(root, 0, 0);
  return { boxes, lines, labels };
};
