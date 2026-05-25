import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  feature,
  layer,
  layersTopDown,
  summarizeCruiseResult,
  toDependencyCruiserConfig,
  toVisualizationConfig,
} from '../dist/index.js';

const routes = layer('routes', ['src/routes']);
const components = layer('components', ['src/components']);
const lib = layer('lib', ['src/lib']);
const visualization = toVisualizationConfig({
  rootDir: 'src',
  ignore: ['src/generated.ts'],
  rules: [layersTopDown('app', [routes, components, lib])],
  features: [feature('orders', ['src/routes/orders.ts'])],
});

test('feature seeds do not create dependency-cruiser forbidden rules', () => {
  assert.deepEqual(toDependencyCruiserConfig([]), { forbidden: [] });
});

test('feature graphs derive transitive project-local dependencies from file seeds', () => {
  const summary = summarizeCruiseResult(
    {
      modules: [
        {
          source: 'src/routes/orders.ts',
          dependencies: [
            dependency('src/components/order-view.tsx'),
            dependency('src/lib/order-types.ts', { preCompilationOnly: true }),
          ],
        },
        {
          source: 'src/components/order-view.tsx',
          dependencies: [
            dependency('src/lib/format.ts'),
            dependency('src/lib/order-types.ts', { typeOnly: true }),
            dependency('react', { coreModule: false }),
          ],
        },
        {
          source: 'src/lib/format.ts',
          dependencies: [],
        },
        {
          source: 'src/lib/order-types.ts',
          dependencies: [dependency('src/lib/type-helper.ts')],
        },
        {
          source: 'src/lib/type-helper.ts',
          dependencies: [],
        },
        {
          source: 'src/generated.ts',
          dependencies: [],
        },
      ],
      summary: { violations: [] },
    },
    visualization,
  );

  assert.deepEqual(summary.layerOrphanFiles, []);
  assert.deepEqual(summary.featureOrphanFiles, ['src/lib/type-helper.ts']);
  assert.deepEqual(summary.featureGraphViolations, []);
  assert.deepEqual(summary.featureGraphs, [
    {
      feature: 'orders',
      seeds: ['src/routes/orders.ts'],
      nodes: [
        {
          file: 'src/components/order-view.tsx',
          kind: 'derived',
          layers: ['components'],
          minDepth: 1,
          maxDepth: 1,
        },
        {
          file: 'src/lib/format.ts',
          kind: 'derived',
          layers: ['lib'],
          minDepth: 2,
          maxDepth: 2,
        },
        {
          file: 'src/lib/order-types.ts',
          kind: 'derived',
          layers: ['lib'],
          minDepth: 1,
          maxDepth: 2,
        },
        {
          file: 'src/routes/orders.ts',
          kind: 'seed',
          layers: ['routes'],
          minDepth: 0,
          maxDepth: 0,
        },
      ],
      edges: [
        {
          from: 'src/components/order-view.tsx',
          to: 'src/lib/format.ts',
          dependencyKind: 'runtime',
        },
        {
          from: 'src/components/order-view.tsx',
          to: 'src/lib/order-types.ts',
          dependencyKind: 'type-only',
        },
        {
          from: 'src/routes/orders.ts',
          to: 'src/components/order-view.tsx',
          dependencyKind: 'runtime',
        },
        {
          from: 'src/routes/orders.ts',
          to: 'src/lib/order-types.ts',
          dependencyKind: 'type-only',
        },
      ],
    },
  ]);
});

test('runtime edges take precedence over type-only edges', () => {
  const summary = summarizeCruiseResult(
    {
      modules: [
        {
          source: 'src/routes/orders.ts',
          dependencies: [
            dependency('src/lib/order-types.ts', { typeOnly: true }),
            dependency('src/lib/order-types.ts'),
          ],
        },
        {
          source: 'src/lib/order-types.ts',
          dependencies: [],
        },
      ],
      summary: { violations: [] },
    },
    visualization,
  );

  assert.equal(summary.featureGraphs?.[0]?.edges[0]?.dependencyKind, 'runtime');
});

test('feature traversal stops include runtime targets as leaf nodes', () => {
  const summary = summarizeCruiseResult(
    {
      modules: [
        {
          source: 'src/routes/orders.ts',
          dependencies: [dependency('src/components/order-view.tsx')],
        },
        {
          source: 'src/components/order-view.tsx',
          dependencies: [dependency('src/lib/format.ts')],
        },
        {
          source: 'src/lib/format.ts',
          dependencies: [],
        },
      ],
      summary: { violations: [] },
    },
    toVisualizationConfig({
      rootDir: 'src',
      rules: [layersTopDown('app', [routes, components, lib])],
      features: [
        feature('orders', ['src/routes/orders.ts'], {
          stopTraversalAt: ['src/components/order-view.tsx'],
        }),
      ],
    }),
  );

  assert.deepEqual(summary.featureOrphanFiles, ['src/lib/format.ts']);
  assert.deepEqual(summary.featureGraphs?.[0], {
    feature: 'orders',
    seeds: ['src/routes/orders.ts'],
    nodes: [
      {
        file: 'src/components/order-view.tsx',
        kind: 'derived',
        layers: ['components'],
        minDepth: 1,
        maxDepth: 1,
      },
      {
        file: 'src/routes/orders.ts',
        kind: 'seed',
        layers: ['routes'],
        minDepth: 0,
        maxDepth: 0,
      },
    ],
    edges: [
      {
        from: 'src/routes/orders.ts',
        to: 'src/components/order-view.tsx',
        dependencyKind: 'runtime',
      },
    ],
  });
});

test('cycles and unresolved imports reachable from feature seeds are violations', () => {
  const summary = summarizeCruiseResult(
    {
      modules: [
        {
          source: 'src/routes/orders.ts',
          dependencies: [dependency('src/components/order-view.tsx')],
        },
        {
          source: 'src/components/order-view.tsx',
          dependencies: [
            dependency('src/routes/orders.ts'),
            unresolvedDependency('@/missing'),
          ],
        },
      ],
      summary: { violations: [] },
    },
    visualization,
  );

  assert.deepEqual(summary.featureGraphViolations, [
    {
      kind: 'feature-cycle',
      feature: 'orders',
      fromFile: 'src/components/order-view.tsx',
      toFile: 'src/routes/orders.ts',
      cycle: [
        'src/routes/orders.ts',
        'src/components/order-view.tsx',
        'src/routes/orders.ts',
      ],
      severity: 'error',
    },
    {
      kind: 'feature-unresolved-import',
      feature: 'orders',
      fromFile: 'src/components/order-view.tsx',
      specifier: '@/missing',
      severity: 'error',
    },
  ]);
});

test('feature seeds must be files under rootDir that are present in the graph', () => {
  assert.throws(
    () =>
      summarizeCruiseResult(
        {
          modules: [],
          summary: { violations: [] },
        },
        toVisualizationConfig({
          rootDir: 'src',
          rules: [layersTopDown('app', [routes, components])],
          features: [feature('missing', ['src/routes/missing.ts'])],
        }),
      ),
    /must be a file present in the dependency graph/,
  );
});

function dependency(resolved, options = {}) {
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

function unresolvedDependency(specifier) {
  return {
    ...dependency(specifier),
    couldNotResolve: true,
    followable: false,
    module: specifier,
    resolved: specifier,
  };
}
