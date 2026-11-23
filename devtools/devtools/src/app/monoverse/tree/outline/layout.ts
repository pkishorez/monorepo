// Where Outline's rows sit on the canvas.
import type { FolderTree, Row } from '../../model/index.js';

/*
 * One row under the other, the full width of one column, so a selection
 * reads as a calm band; a Package's row takes two lines, its folder's name
 * over its own name and version. Left of the column runs the link gutter, where the
 * selection's connections curve from row to row: always on screen beside
 * the names, however narrow the screen. The column is as wide as the
 * widest name the tree could show (worked out once per tree, so it never
 * moves as folders open), but never wider than the screen leaves room for.
 */

export const rowHeight = 26;
/** A Package's row: its folder's name, and its own name and version below. */
export const packageRowHeight = 40;
export const indent = 16;
/** Room left of the depth-0 chevrons, inside the band. */
export const gutter = 8;
/** Room above the first row. */
export const topInset = 8;
/** Room right of the column. */
export const endInset = 12;

/** The widest a wide screen's page runs: the tree sits at its left, the page centred. */
export const pageWidth = 1024;

/** How far in the tree starts, so it sits at the left of a centred page; none on a phone. */
export const shiftFor = (screen: number) =>
  screen < 640 ? 0 : Math.max(0, Math.round((screen - pageWidth) / 2));

/** The width of the link gutter left of the rows, by the screen's width. */
export const leadFor = (screen: number) => (screen < 640 ? 52 : 84);

/** Where each row sits, top to bottom, by its index. */
export interface Placement {
  readonly top: (index: number) => number;
  readonly height: (index: number) => number;
  readonly middle: (index: number) => number;
  /** The bottom of the last row. */
  readonly bottom: number;
}

export function placeRows(rows: ReadonlyArray<Row>): Placement {
  const tops: Array<number> = [];
  const heights: Array<number> = [];
  let at = topInset;
  for (const { node } of rows) {
    const height = node.kind === 'package' ? packageRowHeight : rowHeight;
    tops.push(at);
    heights.push(height);
    at += height;
  }
  const top = (index: number) => tops[index] ?? at;
  const height = (index: number) => heights[index] ?? rowHeight;
  return {
    top,
    height,
    middle: (index) => top(index) + height(index) / 2,
    bottom: at,
  };
}
/** The middle of the chevron of a row at `depth`: where its folder's guide runs. */
export const guideX = (depth: number) => gutter + depth * indent + 8;

const minWidth = 260;
const maxWidth = 520;
// Inter at 13px averages a little under 7px a character; the trailing
// room holds a change count, a broken count and a reveal chip.
const charWidth = 6.6;
const leading = 16 + 4 + 16 + 6;
const trailing = 96;

/** The width of the column: room for the deepest, longest name the tree holds. */
export function columnWidth(tree: FolderTree, room: number): number {
  const base = tree.root.path;
  let widest = 0;
  for (const node of tree.nodes.values()) {
    if (node.path === base) continue;
    const rest = base === '' ? node.path : node.path.slice(base.length + 1);
    let depth = 0;
    for (const char of rest) if (char === '/') depth += 1;
    const text = node.label ?? node.name;
    const width =
      gutter + depth * indent + leading + text.length * charWidth + trailing;
    if (width > widest) widest = width;
  }
  return Math.round(
    Math.max(minWidth, Math.min(maxWidth, Math.max(360, widest), room)),
  );
}

/** One indent guide: the line down the left of an open folder's contents. */
export interface Guide {
  /** The open folder whose contents it runs beside. */
  readonly folder: string;
  readonly x: number;
  readonly top: number;
  readonly height: number;
}

/** A guide for every open folder showing anything, from its first row inside to its last. */
export function guidesOf(
  rows: ReadonlyArray<Row>,
  place: Placement,
  lead: number,
): ReadonlyArray<Guide> {
  const guides: Array<Guide> = [];
  // Open folders still taking rows, innermost last.
  const stack: Array<{ folder: string; depth: number; first: number }> = [];
  const close = (until: number, last: number) => {
    while (stack.length > 0 && stack.at(-1)!.depth >= until) {
      const { folder, depth, first } = stack.pop()!;
      if (last >= first)
        guides.push({
          folder,
          x: lead + guideX(depth),
          top: place.top(first),
          height: place.top(last) + place.height(last) - place.top(first),
        });
    }
  };
  rows.forEach(({ node, depth }, index) => {
    close(depth, index - 1);
    if (node.kind === 'folder' && rows[index + 1]?.depth === depth + 1)
      stack.push({ folder: node.path, depth, first: index + 1 });
  });
  close(0, rows.length - 1);
  return guides;
}
