import { describe, expect, test } from 'vitest';
import type { ArchitectureAnalysis, ChangeSet } from 'laymos';

import { indexChanges } from './project-changes';

function analysis(
  nodes: readonly { path: string; parent?: string; files: string[] }[],
): ArchitectureAnalysis {
  return {
    config: { sourceRoots: ['.'], ignoredPaths: ['src/ignored'] },
    tree: {
      root: '.',
      nodes: nodes.map((node) => ({
        path: node.path,
        kind: 'module',
        shape: 'folder',
        ownFiles: node.files,
        parent: node.parent,
        children: nodes
          .filter((child) => child.parent === node.path)
          .map((child) => child.path),
      })),
      owners: Object.fromEntries(
        nodes.flatMap((node) => node.files.map((file) => [file, node.path])),
      ),
    },
  } as unknown as ArchitectureAnalysis;
}

function changeSet(
  files: readonly (readonly [string, 'added' | 'modified' | 'deleted'])[],
): ChangeSet {
  return {
    baseRef: 'HEAD',
    files: files.map(([path, status]) => ({
      path,
      status,
      committed: false,
      uncommitted: true,
    })),
  };
}

const tree = analysis([
  { path: '.', files: [] },
  { path: 'src', parent: '.', files: ['src/index.ts'] },
  { path: 'src/a', parent: 'src', files: ['src/a/one.ts', 'src/a/two.ts'] },
  { path: 'src/b', parent: 'src', files: ['src/b/one.ts'] },
  { path: 'src/c', parent: 'src', files: ['src/c/one.ts'] },
]);

describe('indexChanges', () => {
  test('marks a Module added when every file it owns is added', () => {
    const actual = indexChanges(
      tree,
      changeSet([
        ['src/a/one.ts', 'added'],
        ['src/a/two.ts', 'added'],
      ]),
    );

    expect(actual.modules.get('src/a')).toBe('added');
  });

  test('marks a Module modified when only some of its files are added', () => {
    const actual = indexChanges(tree, changeSet([['src/a/one.ts', 'added']]));

    expect(actual.modules.get('src/a')).toBe('modified');
  });

  test('marks a Module modified when a file it owns is modified', () => {
    const actual = indexChanges(
      tree,
      changeSet([['src/b/one.ts', 'modified']]),
    );

    expect(actual.modules.get('src/b')).toBe('modified');
  });

  test('leaves untouched Modules out of the index', () => {
    const actual = indexChanges(
      tree,
      changeSet([['src/a/one.ts', 'modified']]),
    );

    expect(actual.modules.has('src/c')).toBe(false);
  });

  test('rolls a change up through every node above its owner', () => {
    const actual = indexChanges(
      tree,
      changeSet([['src/b/one.ts', 'modified']]),
    );

    expect(actual.modules.get('src')).toBe('modified');
    expect(actual.modules.get('.')).toBe('modified');
  });

  test('a node whose whole subtree is new reads as added', () => {
    const actual = indexChanges(
      analysis([
        { path: '.', files: [] },
        { path: 'lib', parent: '.', files: [] },
        { path: 'lib/x', parent: 'lib', files: ['lib/x/index.ts'] },
      ]),
      changeSet([['lib/x/index.ts', 'added']]),
    );

    expect(actual.modules.get('lib')).toBe('added');
    expect(actual.modules.get('.')).toBe('added');
  });

  test('ignores changed paths that belong to no Module', () => {
    const actual = indexChanges(tree, changeSet([['README.md', 'modified']]));

    expect(actual.modules.size).toBe(0);
    expect(actual.files.get('README.md')).toBe('modified');
  });

  test('marks the node holding a deleted file modified, and a deleted Module deleted', () => {
    const index = indexChanges(
      analysis([
        { path: '.', files: [] },
        { path: 'src', parent: '.', files: ['src/index.ts'] },
      ]),
      changeSet([
        ['src/old.ts', 'deleted'],
        ['src/gone/index.ts', 'deleted'],
        ['src/gone/inner/index.ts', 'deleted'],
        ['src/ignored/fixture/index.ts', 'deleted'],
      ]),
    );
    expect(index.modules.get('src')).toBe('modified');
    expect(index.modules.get('.')).toBe('modified');
    expect(index.deletedModules).toEqual(['src/gone', 'src/gone/inner']);
    expect(index.modules.get('src/gone')).toBe('deleted');
  });
});
