import type { ICruiseResult } from 'dependency-cruiser';
import { expect, test } from 'vitest';

import {
  detectCrossGroupEdges,
  feature,
  group,
  layer,
  layersTopDown,
  module,
  summarizeCruiseResult,
  toDependencyCruiserConfig,
  toVisualizationConfig,
} from '../src/index.js';

// --- group() authoring wrapper ------------------------------------------------

test('group() stamps the group onto each stack', () => {
  const a = layersTopDown('a', [
    layer('a1', ['src/a/1']),
    layer('a2', ['src/a/2']),
  ]);
  const b = layersTopDown('b', [
    layer('b1', ['src/b/1']),
    layer('b2', ['src/b/2']),
  ]);
  const [ga, gb] = group('db', [a, b]);
  expect(ga!.config.group).toBe('db');
  expect(gb!.config.group).toBe('db');
});

test('group() leaves the original stacks untouched', () => {
  const a = layersTopDown('a', [
    layer('a1', ['src/a/1']),
    layer('a2', ['src/a/2']),
  ]);
  group('db', [a]);
  expect(a.config.group).toBeUndefined();
});

test('group() rejects an empty name', () => {
  const a = layersTopDown('a', [
    layer('a1', ['src/a/1']),
    layer('a2', ['src/a/2']),
  ]);
  expect(() => group('', [a])).toThrow(/must not be empty/);
});

test('group() rejects reassigning a stack already in another group', () => {
  const a = layersTopDown('a', [
    layer('a1', ['src/a/1']),
    layer('a2', ['src/a/2']),
  ]);
  const [ga] = group('db', [a]);
  expect(() => group('core', [ga!])).toThrow(/already in group "db"/);
});

// --- compile propagation ------------------------------------------------------

test('group propagates onto compiled stacks and modules', () => {
  const stack = layersTopDown('s', [
    layer('barrel', ['src/a/index.ts']),
    layer('impl', ['src/a/internal']),
  ]);
  const cfg = toVisualizationConfig({
    rootDir: 'src',
    rules: [...group('db', [stack])],
    modules: [module('src/a/internal')],
  });
  expect(cfg.stacks[0]!.group).toBe('db');
  expect(cfg.modules![0]!.group).toBe('db');
});

test('ungrouped stacks carry no group field', () => {
  const stack = layersTopDown('s', [
    layer('barrel', ['src/a/index.ts']),
    layer('impl', ['src/a/internal']),
  ]);
  const cfg = toVisualizationConfig({
    rootDir: 'src',
    rules: [stack],
    modules: [module('src/a/internal')],
  });
  expect(cfg.stacks[0]!.group).toBeUndefined();
  expect(cfg.modules![0]!.group).toBeUndefined();
});

test('the same layer name in two groups stays distinct', () => {
  const a = layersTopDown('a', [
    layer('domain', ['src/a/domain']),
    layer('a-impl', ['src/a/impl']),
  ]);
  const b = layersTopDown('b', [
    layer('domain', ['src/b/domain']),
    layer('b-impl', ['src/b/impl']),
  ]);
  const cfg = toVisualizationConfig({
    rootDir: 'src',
    rules: [...group('alpha', [a]), ...group('beta', [b])],
    modules: [module('src/a/domain'), module('src/b/domain')],
  });
  const domains = cfg.modules!.filter((m) => m.layer === 'domain');
  expect(domains.map((m) => m.group).sort()).toEqual(['alpha', 'beta']);
});

test('reused layer names in opposite orders across groups do not form a cycle', () => {
  const alpha = layersTopDown('a', [
    layer('api', ['src/a/api']),
    layer('core', ['src/a/core']),
  ]);
  const beta = layersTopDown('b', [
    layer('core', ['src/b/core']),
    layer('api', ['src/b/api']),
  ]);
  expect(() =>
    toDependencyCruiserConfig([
      ...group('alpha', [alpha]),
      ...group('beta', [beta]),
    ]),
  ).not.toThrow();
});

test('a genuine cycle within one group is still detected', () => {
  const x = layersTopDown('x', [
    layer('api', ['src/api']),
    layer('core', ['src/core']),
  ]);
  const y = layersTopDown('y', [
    layer('core', ['src/core']),
    layer('api', ['src/api']),
  ]);
  expect(() => toDependencyCruiserConfig([x, y])).toThrow(/cycle detected/);
});

// --- cross-group isolation ----------------------------------------------------

function isolationConfig() {
  const a = layersTopDown('a-stack', [
    layer('a-barrel', ['src/a/index.ts']),
    layer('a-impl', ['src/a/internal']),
  ]);
  const b = layersTopDown('b-stack', [
    layer('b-barrel', ['src/b/index.ts']),
    layer('b-impl', ['src/b/internal']),
  ]);
  return toVisualizationConfig({
    rootDir: 'src',
    rules: [...group('alpha', [a]), ...group('beta', [b])],
    features: [feature('alpha'), feature('beta')],
    modules: [
      module('src/a/index.ts', { feature: 'alpha', sharedWith: ['beta'] }),
      module('src/a/internal', { feature: 'alpha' }),
      module('src/b/index.ts', { feature: 'beta' }),
      module('src/b/internal', { feature: 'beta' }),
    ],
  });
}

test('importing another group private internal is a cross-group edge', () => {
  const cfg = isolationConfig();
  const edges = detectCrossGroupEdges(
    {
      modules: [
        {
          source: 'src/b/internal/x.ts',
          dependencies: [dependency('src/a/internal/y.ts')],
        },
        { source: 'src/a/internal/y.ts', dependencies: [] },
      ],
    } as unknown as ICruiseResult,
    cfg,
  );
  expect(edges.length).toBe(1);
  expect(edges[0]!.fromGroup).toBe('beta');
  expect(edges[0]!.toGroup).toBe('alpha');
});

test('summarize fails fast on a cross-group private import', () => {
  const cfg = isolationConfig();
  expect(() =>
    summarize(
      {
        modules: [
          {
            source: 'src/b/internal/x.ts',
            dependencies: [dependency('src/a/internal/y.ts')],
          },
          { source: 'src/a/internal/y.ts', dependencies: [] },
        ],
        summary: { violations: [] },
      },
      cfg,
    ),
  ).toThrow(/Cross-group dependency/);
});

test('importing another group shared barrel is allowed', () => {
  const cfg = isolationConfig();
  const edges = detectCrossGroupEdges(
    {
      modules: [
        {
          source: 'src/b/internal/x.ts',
          dependencies: [dependency('src/a/index.ts')],
        },
        { source: 'src/a/index.ts', dependencies: [] },
      ],
    } as unknown as ICruiseResult,
    cfg,
  );
  expect(edges).toEqual([]);
});

test('within-group import into a private internal is not a cross-group edge', () => {
  const cfg = isolationConfig();
  const edges = detectCrossGroupEdges(
    {
      modules: [
        {
          source: 'src/a/index.ts',
          dependencies: [dependency('src/a/internal/y.ts')],
        },
        { source: 'src/a/internal/y.ts', dependencies: [] },
      ],
    } as unknown as ICruiseResult,
    cfg,
  );
  expect(edges).toEqual([]);
});

// --- helpers (mirrors module-visibility.test.ts) -----------------------------

type CruiseFixture = {
  modules: { source: string; dependencies: ReturnType<typeof dependency>[] }[];
  summary: { violations: Record<string, unknown>[] };
};

function summarize(
  result: CruiseFixture,
  cfg: Parameters<typeof summarizeCruiseResult>[1],
) {
  return summarizeCruiseResult(result as unknown as ICruiseResult, cfg);
}

function dependency(resolved: string, options: Record<string, unknown> = {}) {
  return {
    circular: false,
    coreModule: false,
    couldNotResolve: false,
    dependencyTypes: ['local', 'import'],
    dynamic: false,
    exoticallyRequired: false,
    followable: true,
    module: resolved,
    resolved,
    protocol: 'file:',
    ...options,
  };
}
