import { describe, expect, it } from 'vitest';

import { fileTreeRows } from '../file-tree.js';

/*
 * A folder's files as rows of a tree: folders before files, each by name;
 * a folder holding only one folder shares its row with it; a closed one
 * hides what is in it; and a folder takes the colour its changes roll up to.
 */

const entries = [
  { path: 'src/z.ts', status: 'added' as const },
  { path: 'src/app/one/deep/a.ts', status: 'added' as const },
  { path: 'src/app/one/deep/b.ts', status: 'deleted' as const },
  { path: 'src/lib/c.ts', status: 'modified' as const },
];

const shape = (rows: ReturnType<typeof fileTreeRows>) =>
  rows.map((row) =>
    row.kind === 'folder'
      ? `${'  '.repeat(row.depth)}${row.label}/ ${row.status}`
      : `${'  '.repeat(row.depth)}${row.name} ${row.status}`,
  );

describe('fileTreeRows', () => {
  it('draws folders first, a chain of lone folders on one row', () => {
    expect(shape(fileTreeRows('src', entries, new Set()))).toEqual([
      'app/one/deep/ modified',
      '  a.ts added',
      '  b.ts deleted',
      'lib/ modified',
      '  c.ts modified',
      'z.ts added',
    ]);
  });

  it('hides what is in a closed folder, by the path its row ends at', () => {
    expect(
      shape(fileTreeRows('src', entries, new Set(['src/app/one/deep']))),
    ).toEqual([
      'app/one/deep/ modified',
      'lib/ modified',
      '  c.ts modified',
      'z.ts added',
    ]);
  });

  it('lists from the root, with no colour while Changes is off', () => {
    const rows = fileTreeRows(
      '',
      [
        { path: 'a/b.ts', status: null },
        { path: 'c.ts', status: null },
      ],
      new Set(),
    );
    expect(shape(rows)).toEqual(['a/ null', '  b.ts null', 'c.ts null']);
    expect(rows[0]).toMatchObject({ path: 'a' });
  });
});
