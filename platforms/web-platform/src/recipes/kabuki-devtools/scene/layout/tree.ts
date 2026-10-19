import { along, curve } from './shapes.ts';
import type { Box, Branch, Label, Laid, Line } from './shapes.ts';

/*
 * A packed tree, top-down: every row of boxes at one height, the root's top
 * centre at 0, 0.
 *
 * 1. Rows     each depth as tall as its tallest box.
 * 2. Pack     each subtree slides left until, at some depth, it would touch
 *             the one before it: so a subtree tucks under its neighbour's
 *             empty space, and a parent sits centred over its children.
 * 3. Stack    more than a few boxes with nothing below them hang in one
 *             column, down a spine, instead of one long row.
 * 4. Lines    a smooth curve down from each box to each below it, the label of
 *             what led there on the last stretch.
 */

const GAP = 36;
const DROP = 64;
/** More leaves than this stack in a column. */
const LEAVES = 4;
const STACK_GAP = 32;
const INDENT = 22;
/** Deep enough that a stack keeps its column clear all the way down. */
const DEEP = 64;

interface Shape {
  /** The left and right edge at each depth below and including this box, from its centre. */
  readonly left: number[];
  readonly right: number[];
  /** Each child's centre from this box's centre, or its left edge in a stack. */
  readonly offsets: number[];
  readonly stacked: boolean;
}

const isStack = (branch: Branch) =>
  branch.children.length > LEAVES &&
  branch.children.every(({ branch: child }) => child.children.length === 0);

export const packedTree = (root: Branch): Laid => {
  // 1. Rows
  const tallest: number[] = [];
  const measure = (branch: Branch, depth: number, stacked: boolean) => {
    if (!stacked) tallest[depth] = Math.max(tallest[depth] ?? 0, branch.height);
    const stack = isStack(branch);
    for (const { branch: child } of branch.children)
      measure(child, depth + 1, stack);
  };
  measure(root, 0, false);
  const top: number[] = [0];
  for (let depth = 1; depth <= tallest.length; depth++)
    top[depth] = top[depth - 1]! + tallest[depth - 1]! + DROP;

  // 2. Pack, and 3. Stack
  const shapes = new Map<string, Shape>();
  const shape = (branch: Branch): Shape => {
    const half = branch.width / 2;
    if (isStack(branch)) {
      // A stacked leaf is placed like any box, so it needs a shape too.
      for (const { branch: child } of branch.children) shape(child);
      const column = Math.max(
        ...branch.children.map(({ branch: child }) => child.width),
      );
      const start = -half + INDENT;
      const made: Shape = {
        left: [-half, ...Array<number>(DEEP).fill(start - INDENT)],
        right: [
          half,
          ...Array<number>(DEEP).fill(Math.max(half, start + column)),
        ],
        offsets: branch.children.map(() => start),
        stacked: true,
      };
      shapes.set(branch.id, made);
      return made;
    }
    const children = branch.children.map(({ branch: child }) => shape(child));
    const offsets: number[] = [];
    const left: number[] = [];
    const right: number[] = [];
    children.forEach((child, index) => {
      let at = 0;
      if (index > 0)
        for (let depth = 0; depth < child.left.length; depth++)
          if (right[depth] !== undefined)
            at = Math.max(at, right[depth]! - child.left[depth]! + GAP);
      offsets.push(at);
      child.left.forEach((edge, depth) => {
        left[depth] = Math.min(left[depth] ?? Infinity, edge + at);
        right[depth] = Math.max(
          right[depth] ?? -Infinity,
          child.right[depth]! + at,
        );
      });
    });
    const centre = children.length ? (offsets[0]! + offsets.at(-1)!) / 2 : 0;
    const made: Shape = {
      left: [-half, ...left.map((edge) => edge - centre)],
      right: [half, ...right.map((edge) => edge - centre)],
      offsets: offsets.map((offset) => offset - centre),
      stacked: false,
    };
    shapes.set(branch.id, made);
    return made;
  };
  shape(root);

  // 4. Lines
  const boxes = new Map<string, Box>();
  const lines: Line[] = [];
  const labels: Label[] = [];
  const place = (
    branch: Branch,
    centre: number,
    y: number,
    depth: number,
    parent?: string,
  ) => {
    const box: Box = {
      x: centre - branch.width / 2,
      y,
      width: branch.width,
      height: branch.height,
      depth,
      ...(parent ? { parent } : {}),
    };
    boxes.set(branch.id, box);
    const { offsets, stacked } = shapes.get(branch.id)!;
    const bottom = { x: centre, y: y + branch.height };
    let below = top[depth + 1] ?? y + branch.height + DROP;
    branch.children.forEach(({ via, branch: child }, index) => {
      if (stacked) {
        const left = centre + offsets[index]!;
        const spine = left - INDENT / 2;
        place(child, left + child.width / 2, below, depth + 1, branch.id);
        lines.push({
          id: `${branch.id}->${child.id}`,
          from: branch.id,
          to: child.id,
          ...(via ? { via } : {}),
          d: curve(
            { x: spine, y: bottom.y },
            { x: left, y: below + 16 },
            'across',
          ),
        });
        if (via)
          labels.push({
            id: `${branch.id}->${child.id}:via`,
            owner: branch.id,
            text: via,
            x: left,
            y: below - 9,
            align: 'start',
          });
        below += child.height + STACK_GAP;
        return;
      }
      const at = centre + offsets[index]!;
      place(child, at, below, depth + 1, branch.id);
      lines.push({
        id: `${branch.id}->${child.id}`,
        from: branch.id,
        to: child.id,
        ...(via ? { via } : {}),
        d: curve(bottom, { x: at, y: below }),
      });
      if (via)
        labels.push({
          id: `${branch.id}->${child.id}:via`,
          owner: branch.id,
          text: via,
          // On the curve, most of the way down, where it runs nearly straight.
          ...along(bottom, { x: at, y: below }, 0.78),
          align: 'middle',
        });
    });
  };
  place(root, 0, 0, 0);
  return { boxes, lines, labels };
};
