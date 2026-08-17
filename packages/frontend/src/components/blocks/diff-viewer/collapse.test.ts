import { describe, expect, test } from 'vitest';

import type { DiffRow } from './align';
import { collapseRows, collapseRuns } from './collapse';

function context(line: number): DiffRow {
  const cell = {
    kind: 'context' as const,
    line: {
      kind: 'context' as const,
      content: `line ${line}`,
      oldNumber: line,
      newNumber: line,
    },
  };
  return { left: cell, right: cell };
}

function changed(line: number): DiffRow {
  return {
    left: {
      kind: 'removed',
      line: { kind: 'removed', content: 'old', oldNumber: line },
    },
    right: {
      kind: 'added',
      line: { kind: 'added', content: 'new', newNumber: line },
    },
  };
}

describe('collapseRows', () => {
  test('keeps a short unchanged run expanded', () => {
    const actual = collapseRows([context(1), context(2), changed(3)], 12);

    expect(actual).toEqual([
      { kind: 'unchanged', rows: [context(1), context(2)], collapsible: false },
      { kind: 'changed', rows: [changed(3)] },
    ]);
  });

  test('collapses the middle of a long unchanged run, keeping its edges', () => {
    const rows = [
      ...Array.from({ length: 20 }, (_, index) => context(index + 1)),
      changed(21),
    ];

    const actual = collapseRows(rows, 12);

    expect(actual.map(({ kind }) => kind)).toEqual([
      'unchanged',
      'unchanged',
      'unchanged',
      'changed',
    ]);
    expect(actual[0]?.rows).toHaveLength(3);
    expect(actual[1]?.rows).toHaveLength(14);
    expect(actual[2]?.rows).toHaveLength(3);
    expect(
      actual.filter((chunk) => chunk.kind === 'unchanged' && chunk.collapsible),
    ).toHaveLength(1);
  });

  test('groups consecutive changed rows into one chunk', () => {
    const actual = collapseRows([changed(1), changed(2), context(3)], 12);

    expect(actual[0]).toEqual({
      kind: 'changed',
      rows: [changed(1), changed(2)],
    });
  });

  test('returns nothing for no rows', () => {
    expect(collapseRows([], 12)).toEqual([]);
  });
});

describe('collapseRuns', () => {
  const unchanged = (item: string) => item === '.';

  test('folds the middle of a long unchanged run', () => {
    const items = [...Array.from({ length: 20 }, () => '.'), 'x'];

    const actual = collapseRuns(items, unchanged, 12);

    expect(actual.map(({ collapsible }) => collapsible)).toEqual([
      false,
      true,
      false,
      false,
    ]);
    expect(actual[1]?.items).toHaveLength(14);
  });

  test('leaves a short unchanged run alone', () => {
    const actual = collapseRuns(['.', '.', 'x'], unchanged, 12);

    expect(actual).toEqual([
      { items: ['.', '.'], collapsible: false },
      { items: ['x'], collapsible: false },
    ]);
  });

  test('groups consecutive changed items together', () => {
    const actual = collapseRuns(['x', 'y', '.'], unchanged, 12);

    expect(actual[0]).toEqual({ items: ['x', 'y'], collapsible: false });
  });
});
