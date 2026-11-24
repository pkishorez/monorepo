import { describe, expect, test } from 'vitest';

import {
  buildTree,
  countsWithin,
  foldersHolding,
  isIgnored,
  visibleOf,
  visibleRows,
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
    expect(foldersHolding('', ['packages/core', 'apps/web'])).toEqual([
      'apps',
      'packages',
    ]);
  });

  test('counts what each folder holds', () => {
    const counts = countsWithin(['a/b/c.ts', 'a/d.ts', 'a/d.ts']);
    expect(counts.get('a')).toBe(2);
    expect(counts.get('a/b')).toBe(1);
    expect(counts.get('')).toBe(2);
  });

  test('a path outside every Source root is ignored; the folders holding one are not', () => {
    const roots = ['pkg/src/app'];
    expect(isIgnored('pkg/src/app/x.ts', roots)).toBe(false);
    expect(isIgnored('pkg/src', roots)).toBe(false);
    expect(isIgnored('pkg/src/other.ts', roots)).toBe(true);
    expect(isIgnored('pkg/README.md', roots)).toBe(true);
    expect(isIgnored('pkg/README.md', null)).toBe(false);
  });
});
