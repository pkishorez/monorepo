import { describe, expect, test } from 'vitest';
import type { ArchitectureAnalysis, ChangeSet } from 'laymos';

import { changedPathsUnder, indexChanges } from './changes';

function analysis(
  moduleMembership: readonly (readonly [string, string])[],
  layerMembership: readonly (readonly [string, string])[],
): ArchitectureAnalysis {
  return {
    layerAnalysis: { membership: new Map(layerMembership) },
    moduleAnalysis: { membership: new Map(moduleMembership) },
  } as unknown as ArchitectureAnalysis;
}

function changeSet(
  files: readonly (readonly [string, 'added' | 'modified'])[],
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

const membership = [
  ['src/a/one.ts', 'src/a'],
  ['src/a/two.ts', 'src/a'],
  ['src/b/one.ts', 'src/b'],
  ['src/c/one.ts', 'src/c'],
] as const;

const layers = [
  ['src/a/one.ts', 'core'],
  ['src/a/two.ts', 'core'],
  ['src/b/one.ts', 'edge'],
  ['src/c/one.ts', 'edge'],
] as const;

describe('indexChanges', () => {
  test('marks a Module added when every file it owns is added', () => {
    const actual = indexChanges(
      analysis(membership, layers),
      changeSet([
        ['src/a/one.ts', 'added'],
        ['src/a/two.ts', 'added'],
      ]),
    );

    expect(actual.modules.get('src/a')).toBe('added');
  });

  test('marks a Module modified when only some of its files are added', () => {
    const actual = indexChanges(
      analysis(membership, layers),
      changeSet([['src/a/one.ts', 'added']]),
    );

    expect(actual.modules.get('src/a')).toBe('modified');
  });

  test('marks a Module modified when a file it owns is modified', () => {
    const actual = indexChanges(
      analysis(membership, layers),
      changeSet([['src/b/one.ts', 'modified']]),
    );

    expect(actual.modules.get('src/b')).toBe('modified');
  });

  test('leaves untouched Modules out of the index', () => {
    const actual = indexChanges(
      analysis(membership, layers),
      changeSet([['src/a/one.ts', 'modified']]),
    );

    expect(actual.modules.has('src/c')).toBe(false);
  });

  test('rolls the same rule up to Layers', () => {
    const actual = indexChanges(
      analysis(membership, layers),
      changeSet([
        ['src/b/one.ts', 'added'],
        ['src/c/one.ts', 'added'],
      ]),
    );

    expect(actual.layers.get('edge')).toBe('added');
    expect(actual.layers.has('core')).toBe(false);
  });

  test('ignores changed paths that belong to no Module', () => {
    const actual = indexChanges(
      analysis(membership, layers),
      changeSet([['README.md', 'modified']]),
    );

    expect(actual.modules.size).toBe(0);
    expect(actual.files.get('README.md')).toBe('modified');
  });
});

describe('changedPathsUnder', () => {
  test('selects the changed paths a Module owns', () => {
    const index = indexChanges(
      analysis(membership, layers),
      changeSet([
        ['src/a/one.ts', 'modified'],
        ['src/ab/other.ts', 'added'],
        ['src/b/one.ts', 'added'],
      ]),
    );

    expect([...changedPathsUnder(index, 'src/a')]).toEqual([
      ['src/a/one.ts', 'modified'],
    ]);
  });
});
