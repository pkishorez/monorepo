import { describe, expect, test } from 'vitest';
import type { DiffHunk } from 'laymos';

import { alignHunks, unifiedLines } from './align';

function hunk(lines: DiffHunk['lines']): DiffHunk {
  return { header: '@@ -1,3 +1,3 @@', oldStart: 1, newStart: 1, lines };
}

describe('alignHunks', () => {
  test('puts a context line on both sides of one row', () => {
    const [section] = alignHunks([
      hunk([{ kind: 'context', content: 'kept', oldNumber: 1, newNumber: 1 }]),
    ]);

    expect(section?.rows).toEqual([
      {
        left: {
          kind: 'context',
          line: {
            kind: 'context',
            content: 'kept',
            oldNumber: 1,
            newNumber: 1,
          },
        },
        right: {
          kind: 'context',
          line: {
            kind: 'context',
            content: 'kept',
            oldNumber: 1,
            newNumber: 1,
          },
        },
      },
    ]);
  });

  test('pairs a removal with the addition that replaced it', () => {
    const [section] = alignHunks([
      hunk([
        { kind: 'removed', content: 'old', oldNumber: 1 },
        { kind: 'added', content: 'new', newNumber: 1 },
      ]),
    ]);

    expect(section?.rows).toHaveLength(1);
    expect(section?.rows[0]?.left.kind).toBe('removed');
    expect(section?.rows[0]?.right.kind).toBe('added');
  });

  test('pads the right side when more lines were removed than added', () => {
    const [section] = alignHunks([
      hunk([
        { kind: 'removed', content: 'a', oldNumber: 1 },
        { kind: 'removed', content: 'b', oldNumber: 2 },
        { kind: 'added', content: 'c', newNumber: 1 },
      ]),
    ]);

    expect(section?.rows.map(({ right }) => right.kind)).toEqual([
      'added',
      'empty',
    ]);
  });

  test('pads the left side for a pure addition', () => {
    const [section] = alignHunks([
      hunk([
        { kind: 'added', content: 'a', newNumber: 1 },
        { kind: 'added', content: 'b', newNumber: 2 },
      ]),
    ]);

    expect(section?.rows.map(({ left }) => left.kind)).toEqual([
      'empty',
      'empty',
    ]);
    expect(section?.rows.map(({ right }) => right.kind)).toEqual([
      'added',
      'added',
    ]);
  });

  test('keeps one section per hunk', () => {
    const actual = alignHunks([
      hunk([{ kind: 'added', content: 'a', newNumber: 1 }]),
      {
        header: '@@ -9,1 +9,1 @@',
        oldStart: 9,
        newStart: 9,
        lines: [{ kind: 'added', content: 'b', newNumber: 9 }],
      },
    ]);

    expect(actual.map(({ header }) => header)).toEqual([
      '@@ -1,3 +1,3 @@',
      '@@ -9,1 +9,1 @@',
    ]);
  });
});

describe('unifiedLines', () => {
  test('prefixes each hunk with its header', () => {
    const actual = unifiedLines([
      hunk([
        { kind: 'removed', content: 'old', oldNumber: 1 },
        { kind: 'added', content: 'new', newNumber: 1 },
      ]),
    ]);

    expect(actual.map(({ kind }) => kind)).toEqual([
      'header',
      'removed',
      'added',
    ]);
  });
});
