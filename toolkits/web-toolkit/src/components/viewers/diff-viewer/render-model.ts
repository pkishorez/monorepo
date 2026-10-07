import type { DiffHunk } from 'laymos';
import type { SourceViewerLine } from '../source-viewer';

import { alignHunks, unifiedLines, type DiffCell, type DiffRow } from './align';
import { collapseRuns } from './collapse';

export interface SplitSection {
  readonly header: string;
  readonly left: SideContent;
  readonly right: SideContent;
}

export interface SideContent {
  readonly content: string;
  readonly lines: readonly SourceViewerLine[];
}

export function splitSections(
  hunks: readonly DiffHunk[],
): readonly SplitSection[] {
  return alignHunks(hunks).map(({ header, rows }) => ({
    header,
    left: side(rows.map(({ left }) => left)),
    right: side(rows.map(({ right }) => right)),
  }));
}

export function splitRows(hunks: readonly DiffHunk[]): readonly DiffRow[] {
  return alignHunks(hunks).flatMap(({ rows }) => rows);
}

export function sideOfRows(
  rows: readonly DiffRow[],
  which: 'left' | 'right',
): SideContent {
  return side(rows.map((row) => row[which]));
}

export function unifiedSide(hunks: readonly DiffHunk[]): SideContent {
  const entries = unifiedLines(hunks);
  return {
    content: entries.map(({ content }) => content).join('\n'),
    lines: entries.map(unifiedLineStatus),
  };
}

function unifiedLineStatus(
  entry: ReturnType<typeof unifiedLines>[number],
): SourceViewerLine {
  switch (entry.kind) {
    case 'header':
      return { status: 'meta' };
    case 'added':
      return { status: 'add', number: entry.newNumber };
    case 'removed':
      return { status: 'remove', number: entry.oldNumber };
    default:
      return { status: 'context', number: entry.newNumber };
  }
}

function side(cells: readonly DiffCell[]): SideContent {
  return {
    content: cells
      .map((cell) => (cell.kind === 'empty' ? '' : cell.line.content))
      .join('\n'),
    lines: cells.map((cell) => {
      if (cell.kind === 'empty') return { status: 'empty' as const };
      const number =
        cell.kind === 'added' ? cell.line.newNumber : cell.line.oldNumber;
      const status =
        cell.kind === 'added'
          ? ('add' as const)
          : cell.kind === 'removed'
            ? ('remove' as const)
            : ('context' as const);
      return number === undefined ? { status } : { status, number };
    }),
  };
}

// One side on its own is just that file: every line it contains, in order,
// numbered as it is numbered there, with no alignment padding and no marks.
export function fullSide(
  hunks: readonly DiffHunk[],
  side: 'left' | 'right',
): SideContent {
  const skipped = side === 'left' ? 'added' : 'removed';
  const lines = hunks
    .flatMap((hunk) => hunk.lines)
    .filter(({ kind }) => kind !== skipped);
  return {
    content: lines.map(({ content }) => content).join('\n'),
    lines: lines.map((line) => {
      const number = side === 'left' ? line.oldNumber : line.newNumber;
      return number === undefined
        ? { status: 'context' as const }
        : { status: 'context' as const, number };
    }),
  };
}

export interface UnifiedChunk {
  readonly collapsible: boolean;
  readonly count: number;
  readonly side: SideContent;
}

export function unifiedChunks(
  hunks: readonly DiffHunk[],
): readonly UnifiedChunk[] {
  const entries = unifiedLines(hunks);
  return collapseRuns(entries, (entry) => entry.kind === 'context').map(
    (run) => ({
      collapsible: run.collapsible,
      count: run.items.length,
      side: {
        content: run.items.map(({ content }) => content).join('\n'),
        lines: run.items.map(unifiedLineStatus),
      },
    }),
  );
}
