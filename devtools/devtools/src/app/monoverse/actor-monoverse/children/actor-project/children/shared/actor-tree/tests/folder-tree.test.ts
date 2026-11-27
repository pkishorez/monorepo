import { describe, expect, test } from 'vitest';

import {
  buildTree,
  unfolded,
  visibleOf,
  visibleRows,
  withDeleted,
} from '../logic/shared/index.js';

const files = (...paths: Array<string>) =>
  paths.map((path) => ({ path, kind: 'file' as const }));

describe('the folder tree', () => {
  const tree = buildTree(
    'pkg',
    files(
      'pkg/src/b.ts',
      'pkg/src/a/x.ts',
      'pkg/README.md',
      'pkg/src/a/deep/y.ts',
      'other/z.ts',
    ),
  );

  test('holds the folders between the files, folders first, each by name', () => {
    const shape = (node: (typeof tree)['root']): unknown =>
      node.children.map((child) =>
        child.kind === 'folder' ? { [child.name]: shape(child) } : child.name,
      );
    expect(shape(tree.root)).toEqual([
      { src: [{ a: [{ deep: ['y.ts'] }, 'x.ts'] }, 'b.ts'] },
      'README.md',
    ]);
    expect(tree.nodes.has('other/z.ts')).toBe(false);
  });

  test('shows what is in the root, and inside every open folder', () => {
    const open = new Set(['pkg/src']);
    expect(
      visibleRows(tree, (path) => open.has(path)).map(
        ({ node, depth }) => `${depth}:${node.path}`,
      ),
    ).toEqual([
      '0:pkg/src',
      '1:pkg/src/a',
      '1:pkg/src/b.ts',
      '0:pkg/README.md',
    ]);
  });

  test('a path is on screen as itself, or as the outermost closed folder above it', () => {
    const open = new Set(['pkg/src']);
    const isOpen = (path: string) => open.has(path);
    expect(visibleOf(tree, isOpen, 'pkg/src/b.ts')).toBe('pkg/src/b.ts');
    expect(visibleOf(tree, isOpen, 'pkg/src/a/deep/y.ts')).toBe('pkg/src/a');
    expect(visibleOf(tree, () => false, 'pkg/src/a/x.ts')).toBe('pkg/src');
    expect(visibleOf(tree, isOpen, 'other/z.ts')).toBeUndefined();
  });

  test('a Package is one leaf standing for its folder', () => {
    const repo = buildTree('', [
      ...files('package.json', 'packages/core/src/x.ts'),
      { path: 'packages/core', kind: 'package', label: '@me/core' },
      { path: 'apps/web', kind: 'package', label: 'web' },
    ]);
    expect(repo.nodes.get('packages/core')).toMatchObject({
      kind: 'package',
      label: '@me/core',
      children: [],
    });
    expect(repo.nodes.has('packages/core/src/x.ts')).toBe(false);
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

describe('a right click on a folder', () => {
  const inside = ['src/a', 'src/a/deep'];

  test('opens a closed folder with the folders inside it closed', () => {
    expect(unfolded(new Set(['src/a']), 'src', inside)).toEqual(['src']);
  });

  test('opens every folder inside an open one', () => {
    expect(unfolded(new Set(['src']), 'src', inside)).toEqual([
      'src',
      'src/a',
      'src/a/deep',
    ]);
    expect(unfolded(new Set(['src', 'src/a']), 'src', inside)).toEqual([
      'src',
      'src/a',
      'src/a/deep',
    ]);
  });

  test('counts a folder the focus opens around as open', () => {
    const around = new Set(['src']);
    expect(
      unfolded(new Set(), 'src', inside, (path) => around.has(path)),
    ).toEqual(['src/a', 'src/a/deep']);
  });

  test('closes them again once all are open, keeping the folder open', () => {
    expect(
      unfolded(new Set(['src', 'src/a', 'src/a/deep']), 'src', inside),
    ).toEqual(['src']);
  });
});
