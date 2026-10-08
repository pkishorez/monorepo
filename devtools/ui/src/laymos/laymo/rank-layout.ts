import type { Size } from '../canvas-space';

export interface RankItem extends Size {
  readonly key: string;
}

export interface RankPlacement {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly rank: number;
}

export interface RankLayout extends Size {
  readonly placements: readonly RankPlacement[];
  /** Every line of cards, top to bottom, each left to right. */
  readonly rows: readonly (readonly string[])[];
}

export interface RankSpacing {
  /** Between two ranks. */
  readonly rank: number;
  /** Between two wrapped rows of one rank. */
  readonly row: number;
  /** Between two cards on one row. */
  readonly column: number;
}

export const defaultRankSpacing: RankSpacing = {
  rank: 56,
  row: 16,
  column: 16,
};

/**
 * The Module rank of each key: 0 for one nothing imports, else one below
 * the highest of the keys importing it. A loop ranks its members where the
 * walk first reached them.
 */
export function computeRanks(
  keys: readonly string[],
  edges: readonly (readonly [string, string])[],
): ReadonlyMap<string, number> {
  const predecessors = new Map(keys.map((key) => [key, new Set<string>()]));
  for (const [from, to] of edges) predecessors.get(to)?.add(from);
  const ranks = new Map<string, number>();
  const visiting = new Set<string>();
  const rank = (key: string): number => {
    const known = ranks.get(key);
    if (known !== undefined) return known;
    if (visiting.has(key)) return 0;
    visiting.add(key);
    const incoming = predecessors.get(key) ?? new Set<string>();
    const value =
      incoming.size === 0
        ? 0
        : Math.max(...[...incoming].map((parent) => rank(parent))) + 1;
    visiting.delete(key);
    ranks.set(key, value);
    return value;
  };
  for (const key of keys) rank(key);
  return ranks;
}

/**
 * Stacks the items by rank, importers above what they import, and wraps
 * each rank into rows. The ranks decide the height, so the width is the
 * only thing left to choose: the column count that makes the block nearest
 * to a square wins. Pure: items in the same order always land the same.
 */
export function layoutRanks(
  items: readonly RankItem[],
  edges: readonly (readonly [string, string])[],
  spacing: RankSpacing = defaultRankSpacing,
): RankLayout {
  const ranks = computeRanks(
    items.map((item) => item.key),
    edges,
  );
  const byRank = new Map<number, RankItem[]>();
  for (const item of items) {
    const rank = ranks.get(item.key) ?? 0;
    byRank.set(rank, [...(byRank.get(rank) ?? []), item]);
  }
  const stacked = [...byRank.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, row]) => row);
  const widest = Math.max(1, ...stacked.map((rank) => rank.length));
  let best = flow(stacked, widest, spacing);
  for (let columns = 1; columns < widest; columns += 1) {
    const candidate = flow(stacked, columns, spacing);
    if (aspect(candidate) < aspect(best)) best = candidate;
  }
  return best;
}

function aspect({ width, height }: Size): number {
  if (width === 0 || height === 0) return Number.POSITIVE_INFINITY;
  return Math.max(width, height) / Math.min(width, height);
}

function flow(
  ranks: readonly (readonly RankItem[])[],
  columns: number,
  spacing: RankSpacing,
): RankLayout {
  const lines: { items: readonly RankItem[]; gap: number; rank: number }[] = [];
  ranks.forEach((rank, rankIndex) => {
    for (let at = 0; at < rank.length; at += columns) {
      lines.push({
        items: rank.slice(at, at + columns),
        gap: lines.length === 0 ? 0 : at === 0 ? spacing.rank : spacing.row,
        rank: rankIndex,
      });
    }
  });
  const lineWidth = (items: readonly RankItem[]) =>
    items.reduce((total, item) => total + item.width, 0) +
    Math.max(0, items.length - 1) * spacing.column;
  const width = Math.max(0, ...lines.map(({ items }) => lineWidth(items)));
  const placements: RankPlacement[] = [];
  let y = 0;
  for (const line of lines) {
    y += line.gap;
    let x = (width - lineWidth(line.items)) / 2;
    for (const item of line.items) {
      placements.push({ key: item.key, x, y, rank: line.rank });
      x += item.width + spacing.column;
    }
    y += Math.max(0, ...line.items.map((item) => item.height));
  }
  return {
    placements,
    rows: lines.map((line) => line.items.map((item) => item.key)),
    width,
    height: y,
  };
}
