import { describe, expect, test } from 'vitest';

import { parsePatch } from '../parse-patch.js';

const patch = [
  'diff --git a/pkg/edited.ts b/pkg/edited.ts',
  'index 1111111..2222222 100644',
  '--- a/pkg/edited.ts',
  '+++ b/pkg/edited.ts',
  '@@ -1,3 +1,3 @@',
  ' const kept = 1;',
  '-const gone = 2;',
  '+const fresh = 3;',
  ' const tail = 4;',
  '',
].join('\n');

describe('parsePatch', () => {
  test('drops the file header and keeps one hunk', () => {
    const actual = parsePatch(patch);

    expect(actual).toHaveLength(1);
    expect(actual[0]?.header).toBe('@@ -1,3 +1,3 @@');
    expect(actual[0]?.oldStart).toBe(1);
    expect(actual[0]?.newStart).toBe(1);
  });

  test('numbers each line in the side of the file it belongs to', () => {
    const actual = parsePatch(patch);

    expect(actual[0]?.lines).toEqual([
      {
        kind: 'context',
        content: 'const kept = 1;',
        oldNumber: 1,
        newNumber: 1,
      },
      { kind: 'removed', content: 'const gone = 2;', oldNumber: 2 },
      { kind: 'added', content: 'const fresh = 3;', newNumber: 2 },
      {
        kind: 'context',
        content: 'const tail = 4;',
        oldNumber: 3,
        newNumber: 3,
      },
    ]);
  });

  test('keeps several hunks separate and numbers each from its own header', () => {
    const actual = parsePatch(
      [
        '@@ -1,1 +1,2 @@',
        ' first',
        '+second',
        '@@ -40,2 +41,2 @@ function context() {',
        ' fortieth',
        '-old',
        '+new',
        '',
      ].join('\n'),
    );

    expect(actual).toHaveLength(2);
    expect(actual[1]?.oldStart).toBe(40);
    expect(actual[1]?.newStart).toBe(41);
    expect(actual[1]?.lines.map(({ oldNumber }) => oldNumber)).toEqual([
      40,
      41,
      undefined,
    ]);
    expect(actual[1]?.lines.map(({ newNumber }) => newNumber)).toEqual([
      41,
      undefined,
      42,
    ]);
  });

  test('ignores the no-newline marker', () => {
    const actual = parsePatch(
      ['@@ -1,1 +1,1 @@', '-old', '+new', '\\ No newline at end of file'].join(
        '\n',
      ),
    );

    expect(actual[0]?.lines.map(({ kind }) => kind)).toEqual([
      'removed',
      'added',
    ]);
  });

  test('returns no hunks for an empty patch', () => {
    expect(parsePatch('')).toEqual([]);
  });
});
