import type { DiffRow } from './align';

export type DiffChunk =
  | { readonly kind: 'changed'; readonly rows: readonly DiffRow[] }
  | {
      readonly kind: 'unchanged';
      readonly rows: readonly DiffRow[];
      readonly collapsible: boolean;
    };

export const collapseThreshold = 12;
export const keptEdge = 3;

export function collapseRows(
  rows: readonly DiffRow[],
  threshold = collapseThreshold,
): readonly DiffChunk[] {
  const chunks: DiffChunk[] = [];
  let index = 0;

  while (index < rows.length) {
    const start = index;
    while (index < rows.length && isUnchanged(rows[index] as DiffRow))
      index += 1;
    if (index > start) {
      chunks.push(...unchangedChunks(rows.slice(start, index), threshold));
      continue;
    }
    while (index < rows.length && !isUnchanged(rows[index] as DiffRow))
      index += 1;
    chunks.push({ kind: 'changed', rows: rows.slice(start, index) });
  }

  return chunks;
}

function unchangedChunks(
  rows: readonly DiffRow[],
  threshold: number,
): readonly DiffChunk[] {
  if (rows.length <= threshold) {
    return [{ kind: 'unchanged', rows, collapsible: false }];
  }
  return [
    { kind: 'unchanged', rows: rows.slice(0, keptEdge), collapsible: false },
    {
      kind: 'unchanged',
      rows: rows.slice(keptEdge, rows.length - keptEdge),
      collapsible: true,
    },
    {
      kind: 'unchanged',
      rows: rows.slice(rows.length - keptEdge),
      collapsible: false,
    },
  ];
}

function isUnchanged(row: DiffRow): boolean {
  return row.left.kind === 'context' && row.right.kind === 'context';
}

export interface Run<T> {
  readonly items: readonly T[];
  readonly collapsible: boolean;
}

// The same folding as collapseRows, over any sequence that knows which of its
// items are unchanged.
export function collapseRuns<T>(
  items: readonly T[],
  isUnchanged: (item: T) => boolean,
  threshold = collapseThreshold,
): readonly Run<T>[] {
  const runs: Run<T>[] = [];
  let index = 0;

  while (index < items.length) {
    const start = index;
    while (index < items.length && isUnchanged(items[index] as T)) index += 1;
    if (index > start) {
      const run = items.slice(start, index);
      if (run.length <= threshold) {
        runs.push({ items: run, collapsible: false });
      } else {
        runs.push(
          { items: run.slice(0, keptEdge), collapsible: false },
          {
            items: run.slice(keptEdge, run.length - keptEdge),
            collapsible: true,
          },
          { items: run.slice(run.length - keptEdge), collapsible: false },
        );
      }
      continue;
    }
    while (index < items.length && !isUnchanged(items[index] as T)) index += 1;
    runs.push({ items: items.slice(start, index), collapsible: false });
  }

  return runs;
}
