import type { DiffHunk, DiffLine } from 'laymos';

export type DiffCell =
  | { readonly kind: 'context' | 'added' | 'removed'; readonly line: DiffLine }
  | { readonly kind: 'empty' };

export interface DiffRow {
  readonly left: DiffCell;
  readonly right: DiffCell;
}

export interface DiffSection {
  readonly header: string;
  readonly rows: readonly DiffRow[];
}

const empty: DiffCell = { kind: 'empty' };

export function alignHunks(hunks: readonly DiffHunk[]): readonly DiffSection[] {
  return hunks.map((hunk) => ({
    header: hunk.header,
    rows: alignLines(hunk.lines),
  }));
}

export function unifiedLines(
  hunks: readonly DiffHunk[],
): readonly (
  | DiffLine
  | { readonly kind: 'header'; readonly content: string }
)[] {
  return hunks.flatMap((hunk) => [
    { kind: 'header' as const, content: hunk.header },
    ...hunk.lines,
  ]);
}

function alignLines(lines: readonly DiffLine[]): readonly DiffRow[] {
  const rows: DiffRow[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] as DiffLine;
    if (line.kind === 'context') {
      rows.push({
        left: { kind: 'context', line },
        right: { kind: 'context', line },
      });
      index += 1;
      continue;
    }

    const removed: DiffLine[] = [];
    const added: DiffLine[] = [];
    while (lines[index]?.kind === 'removed') {
      removed.push(lines[index] as DiffLine);
      index += 1;
    }
    while (lines[index]?.kind === 'added') {
      added.push(lines[index] as DiffLine);
      index += 1;
    }
    // A lone added run at the start of a block has no removals to pair with.
    if (removed.length === 0 && added.length === 0) {
      index += 1;
      continue;
    }
    for (
      let pair = 0;
      pair < Math.max(removed.length, added.length);
      pair += 1
    ) {
      const left = removed[pair];
      const right = added[pair];
      rows.push({
        left: left === undefined ? empty : { kind: 'removed', line: left },
        right: right === undefined ? empty : { kind: 'added', line: right },
      });
    }
  }

  return rows;
}
