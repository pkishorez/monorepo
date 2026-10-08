import { describe, expect, test } from 'vitest';

import { ancestorsOf, buildModuleTree, modulesWithin } from '../index.js';

describe('buildModuleTree', () => {
  const tree = buildModuleTree(
    [
      'src/index.ts',
      'src/boot.ts',
      'src/db/index.ts',
      'src/db/db.ts',
      'src/db/std-table/contract/index.ts',
      'src/db/std-table/contract/types.ts',
      'src/db/sqlite/index.ts',
      'src/db/sqlite/drivers/bun.ts',
      'src/core/error.ts',
      'src/core/ulid.ts',
      'src/loose.js',
    ],
    ['src/core/error.ts'],
  );

  test('a folder with an index file is a Module, any other folder a Wrapper', () => {
    expect(
      Object.fromEntries(tree.nodes.map(({ path, kind }) => [path, kind])),
    ).toEqual({
      '.': 'wrapper',
      src: 'module',
      'src/core': 'wrapper',
      'src/core/error.ts': 'module',
      'src/db': 'module',
      'src/db/sqlite': 'module',
      'src/db/std-table': 'wrapper',
      'src/db/std-table/contract': 'module',
    });
  });

  test('own files stop at the nearest Module above, nested Modules excluded', () => {
    const node = (path: string) =>
      tree.nodes.find((candidate) => candidate.path === path)!;

    expect(node('src').ownFiles).toEqual([
      'src/boot.ts',
      'src/core/ulid.ts',
      'src/index.ts',
      'src/loose.js',
    ]);
    expect(node('src/db').ownFiles).toEqual([
      'src/db/db.ts',
      'src/db/index.ts',
    ]);
    expect(node('src/db/sqlite').ownFiles).toEqual([
      'src/db/sqlite/drivers/bun.ts',
      'src/db/sqlite/index.ts',
    ]);
    expect(node('src/db').children).toEqual([
      'src/db/sqlite',
      'src/db/std-table',
    ]);
    expect(node('src/db').index).toBe('src/db/index.ts');
    expect(node('src/db/std-table').index).toBeUndefined();
  });

  test('a File Module owns itself; the Module above keeps the rest', () => {
    expect(tree.owners['src/core/error.ts']).toBe('src/core/error.ts');
    expect(tree.owners['src/core/ulid.ts']).toBe('src');
    expect(
      tree.nodes.find(({ path }) => path === 'src/core/error.ts'),
    ).toMatchObject({
      kind: 'module',
      shape: 'file',
      index: 'src/core/error.ts',
    });
  });

  test('walks ancestors and the Modules within a path', () => {
    expect(ancestorsOf(tree, 'src/db/std-table/contract')).toEqual([
      'src/db/std-table',
      'src/db',
      'src',
      '.',
    ]);
    expect(modulesWithin(tree, 'src/db').map(({ path }) => path)).toEqual([
      'src/db',
      'src/db/sqlite',
      'src/db/std-table/contract',
    ]);
  });
});
