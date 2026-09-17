import { describe, expect, test } from 'vitest';

import { buildPackageGraph, type PackageManifest } from '../index.js';

function manifest(
  name: string,
  path: string,
  declared: Partial<PackageManifest['declared']> = {},
  extra: Partial<
    Pick<PackageManifest, 'version' | 'private' | 'hasLaymos'>
  > = {},
): PackageManifest {
  return {
    name,
    path,
    private: extra.private ?? false,
    hasLaymos: extra.hasLaymos ?? false,
    ...(extra.version === undefined ? {} : { version: extra.version }),
    declared: {
      runtime: declared.runtime ?? [],
      dev: declared.dev ?? [],
      peer: declared.peer ?? [],
      optional: declared.optional ?? [],
    },
  };
}

describe('buildPackageGraph', () => {
  test('matches dependencies by name and ignores external ones', () => {
    const graph = buildPackageGraph([
      manifest('app', 'apps/app', { runtime: ['lib', 'react'] }),
      manifest('lib', 'packages/lib', {}, { version: '1.0.0' }),
    ]);
    expect(graph.packages.map((pkg) => pkg.name)).toEqual(['app', 'lib']);
    expect(graph.packages[0]?.dependencies).toEqual([
      { name: 'lib', kinds: ['runtime'] },
    ]);
    expect(graph.packages[0]?.group).toBe('apps');
    expect(graph.packages[1]?.version).toBe('1.0.0');
    expect(graph.violations).toEqual([]);
  });

  test('merges every kind that links one pair, in kind order', () => {
    const graph = buildPackageGraph([
      manifest('ui', 'toolkits/ui', { peer: ['core'], dev: ['core'] }),
      manifest('core', 'toolkits/core'),
    ]);
    expect(graph.packages[1]?.dependencies).toEqual([
      { name: 'core', kinds: ['dev', 'peer'] },
    ]);
  });

  test('a self reference is not a dependency', () => {
    const graph = buildPackageGraph([
      manifest('solo', 'packages/solo', { dev: ['solo'] }),
    ]);
    expect(graph.packages[0]?.dependencies).toEqual([]);
  });

  test('reports each cycle once, starting at its first name', () => {
    const graph = buildPackageGraph([
      manifest('b', 'p/b', { runtime: ['c'] }),
      manifest('c', 'p/c', { dev: ['a'] }),
      manifest('a', 'p/a', { runtime: ['b'] }),
      manifest('d', 'p/d', { runtime: ['a'] }),
    ]);
    expect(graph.violations).toEqual([{ packages: ['a', 'b', 'c'] }]);
  });

  test('reports two independent cycles', () => {
    const graph = buildPackageGraph([
      manifest('a', 'p/a', { runtime: ['b'] }),
      manifest('b', 'p/b', { runtime: ['a'] }),
      manifest('x', 'p/x', { runtime: ['y'] }),
      manifest('y', 'p/y', { runtime: ['x'] }),
    ]);
    expect(graph.violations).toEqual([
      { packages: ['a', 'b'] },
      { packages: ['x', 'y'] },
    ]);
  });
});

test('skips dense acyclic paths even when they lead into a cycle', () => {
  const names = Array.from({ length: 64 }, (_, index) => `p${index}`);
  const graph = buildPackageGraph([
    ...names.map((name, index) =>
      manifest(name, `p/${name}`, {
        runtime: [...names.slice(index + 1), 'x'],
      }),
    ),
    manifest('x', 'p/x', { runtime: ['y'] }),
    manifest('y', 'p/y', { runtime: ['x'] }),
  ]);
  expect(graph.violations).toEqual([{ packages: ['x', 'y'] }]);
});

test('retains all overlapping cycles and their direction', () => {
  const graph = buildPackageGraph([
    manifest('c', 'p/c', { runtime: ['a', 'b', 'leaf'] }),
    manifest('b', 'p/b', { runtime: ['a', 'c'] }),
    manifest('a', 'p/a', { runtime: ['b', 'c'] }),
    manifest('leaf', 'p/leaf'),
  ]);
  expect(graph.violations).toEqual([
    { packages: ['a', 'b'] },
    { packages: ['a', 'b', 'c'] },
    { packages: ['a', 'c'] },
    { packages: ['a', 'c', 'b'] },
    { packages: ['b', 'c'] },
  ]);
});
