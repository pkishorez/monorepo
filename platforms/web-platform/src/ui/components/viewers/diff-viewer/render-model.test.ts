import { describe, expect, test } from 'vitest';
import type { DiffHunk } from 'laymos';

import { fullSide } from './render-model';

const hunks: DiffHunk[] = [
  {
    header: '@@ -1,4 +1,4 @@',
    oldStart: 1,
    newStart: 1,
    lines: [
      { kind: 'context', content: 'one', oldNumber: 1, newNumber: 1 },
      { kind: 'removed', content: 'gone', oldNumber: 2 },
      { kind: 'added', content: 'fresh', newNumber: 2 },
      { kind: 'context', content: 'three', oldNumber: 3, newNumber: 3 },
    ],
  },
];

describe('fullSide', () => {
  test('rebuilds the base file with its own numbering', () => {
    const actual = fullSide(hunks, 'left');

    expect(actual.content).toBe('one\ngone\nthree');
    expect(actual.lines).toEqual([
      { status: 'context', number: 1 },
      { status: 'context', number: 2 },
      { status: 'context', number: 3 },
    ]);
  });

  test('rebuilds the working tree file with its own numbering', () => {
    const actual = fullSide(hunks, 'right');

    expect(actual.content).toBe('one\nfresh\nthree');
    expect(actual.lines).toEqual([
      { status: 'context', number: 1 },
      { status: 'context', number: 2 },
      { status: 'context', number: 3 },
    ]);
  });

  test('leaves no padding rows behind', () => {
    expect(
      fullSide(hunks, 'left').lines.some(({ status }) => status === 'empty'),
    ).toBe(false);
  });
});
