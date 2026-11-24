import { describe, expect, test } from 'vitest';

import { changeTallies, statusOf, withDeleted } from '../logic/shared/index.js';

describe('git roll-up', () => {
  const tallies = changeTallies([
    { path: 'src/new/a.ts', status: 'added' },
    { path: 'src/new/b.ts', status: 'added' },
    { path: 'src/old/c.ts', status: 'deleted' },
    { path: 'src/edit.ts', status: 'modified' },
  ]);
  const status = (path: string) => {
    const tally = tallies.get(path);
    return tally === undefined ? null : statusOf(tally);
  };

  test('a file is what happened to it', () => {
    expect(status('src/new/a.ts')).toBe('added');
    expect(status('src/edit.ts')).toBe('modified');
    expect(status('src/untouched.ts')).toBe(null);
  });

  test('a folder is added or deleted only when all that changed in it was', () => {
    expect(status('src/new')).toBe('added');
    expect(status('src/old')).toBe('deleted');
    expect(status('src')).toBe('modified');
    expect(tallies.get('src')).toEqual({ added: 2, modified: 1, deleted: 1 });
  });

  test('deleted files are drawn where they stood', () => {
    expect(
      withDeleted(
        ['src/edit.ts'],
        [
          { path: 'src/old/c.ts', status: 'deleted' },
          { path: 'src/edit.ts', status: 'modified' },
        ],
      ),
    ).toEqual(['src/edit.ts', 'src/old/c.ts']);
    const files = ['a.ts'];
    expect(withDeleted(files, null)).toBe(files);
  });
});
