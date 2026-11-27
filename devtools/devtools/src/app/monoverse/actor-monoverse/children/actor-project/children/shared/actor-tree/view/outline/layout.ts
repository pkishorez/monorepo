import type { Row } from '../../logic/shared/index.js';

export const rowHeight = 26;
export const packageRowHeight = 40;
export const indent = 16;
export const gutter = 8;
export const topInset = 8;
export const endInset = 12;

export const leadFor = (screen: number) => (screen < 640 ? 52 : 84);

export interface Placement {
  readonly top: (index: number) => number;
  readonly height: (index: number) => number;
  readonly middle: (index: number) => number;
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
export const guideX = (depth: number) => gutter + depth * indent + 8;

const minWidth = 260;
const maxWidth = 520;

export function columnWidth(room: number): number {
  return Math.round(Math.max(minWidth, Math.min(maxWidth, room)));
}

export interface Guide {
  readonly folder: string;
  readonly x: number;
  readonly top: number;
  readonly height: number;
}

export function guidesOf(
  rows: ReadonlyArray<Row>,
  place: Placement,
  lead: number,
): ReadonlyArray<Guide> {
  const guides: Array<Guide> = [];
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
