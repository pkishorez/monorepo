import { describe, expect, test } from 'vitest';

import { fileDependencies, folderDependencies } from '../index.js';
import type { FileGraph } from '../index.js';

// a.ts and b.ts live under foo/; foo/a.ts -> foo/b.ts -> bar/c.ts -> bar/d.ts
// foo/a.ts also -> bar/e.ts directly, and bar/d.ts -> foo/a.ts (a cycle back in).
const graph: FileGraph = new Map([
  ['foo/a.ts', ['foo/b.ts', 'bar/e.ts']],
  ['foo/b.ts', ['bar/c.ts']],
  ['bar/c.ts', ['bar/d.ts']],
  ['bar/d.ts', ['foo/a.ts']],
  ['bar/e.ts', []],
]);

describe('fileDependencies', () => {
  test('returns only direct dependencies by default', () => {
    expect(fileDependencies(graph, 'foo/a.ts')).toEqual([
      { path: 'bar/e.ts', kind: 'direct' },
      { path: 'foo/b.ts', kind: 'direct' },
    ]);
  });

  test('returns transitive dependencies when recursive, direct first', () => {
    expect(fileDependencies(graph, 'foo/a.ts', { recursive: true })).toEqual([
      { path: 'bar/e.ts', kind: 'direct' },
      { path: 'foo/b.ts', kind: 'direct' },
      { path: 'bar/c.ts', kind: 'recursive' },
      { path: 'bar/d.ts', kind: 'recursive' },
    ]);
  });

  test('never reports the target file itself, even through a cycle', () => {
    const entries = fileDependencies(graph, 'foo/a.ts', { recursive: true });
    expect(entries.some((entry) => entry.path === 'foo/a.ts')).toBe(false);
  });

  test('a leaf file has no dependencies', () => {
    expect(fileDependencies(graph, 'bar/e.ts', { recursive: true })).toEqual(
      [],
    );
  });
});

describe('folderDependencies', () => {
  test('excludes files that are members of the folder, direct only by default', () => {
    // foo/a.ts -> bar/e.ts and foo/b.ts -> bar/c.ts are both direct, since
    // every file in foo/ is a seed, not just files reachable from one entry point.
    expect(folderDependencies(graph, 'foo')).toEqual([
      { path: 'bar/c.ts', kind: 'direct' },
      { path: 'bar/e.ts', kind: 'direct' },
    ]);
  });

  test('includes recursive external dependencies, without ever surfacing internal members', () => {
    // bar/c.ts -> bar/d.ts is only reached by walking past bar/c.ts, and
    // bar/d.ts -> foo/a.ts loops back into the folder, so it never appears.
    expect(folderDependencies(graph, 'foo', { recursive: true })).toEqual([
      { path: 'bar/c.ts', kind: 'direct' },
      { path: 'bar/e.ts', kind: 'direct' },
      { path: 'bar/d.ts', kind: 'recursive' },
    ]);
  });

  test('"." as the target means every file is a member, so nothing is external', () => {
    expect(folderDependencies(graph, '.', { recursive: true })).toEqual([]);
  });
});
