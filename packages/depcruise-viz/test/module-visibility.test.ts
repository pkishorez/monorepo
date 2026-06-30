import type { ICruiseResult } from 'dependency-cruiser';
import { expect, test } from 'vitest';

import {
  feature,
  layer,
  layersTopDown,
  module,
  summarizeCruiseResult,
  toVisualizationConfig,
} from '../src/index.js';

function expect_equal(actual: unknown, expected: unknown) {
  expect(actual).toBe(expected);
}

function expect_deepEqual(actual: unknown, expected: unknown) {
  expect(actual).toEqual(expected);
}

const assert = {
  throws(fn: () => unknown, matcher: RegExp) {
    expect(fn).toThrow(matcher);
  },
};

const routes = layer('routes', ['src/routes']);
const components = layer('components', ['src/components']);
const lib = layer('lib', ['src/lib']);

function baseConfig(extra = {}) {
  return toVisualizationConfig({
    rootDir: 'src',
    rules: [layersTopDown('app', [routes, components, lib])],
    features: [feature('orders'), feature('billing')],
    ...extra,
  });
}

test('module() default visibility: private with feature, public without', () => {
  expect_equal(module('src/routes/orders').visibility, 'public');
  expect_equal(
    module('src/routes/orders', { feature: 'orders' }).visibility,
    'private',
  );
});

test('module() sharedWith forces shared visibility', () => {
  const m = module('src/lib/format', {
    feature: 'orders',
    sharedWith: ['billing'],
  });
  expect_equal(m.visibility, 'shared');
  expect_deepEqual(m.sharedWith, ['billing']);
});

test('module() shared without sharedWith throws', () => {
  assert.throws(
    () => module('src/lib/format', { visibility: 'shared' }),
    /no sharedWith/,
  );
});

test('module() sharedWith with conflicting visibility throws', () => {
  assert.throws(
    () =>
      module('src/lib/format', {
        visibility: 'public',
        sharedWith: ['billing'],
      }),
    /must be "shared"/,
  );
});

test('module under no layer throws', () => {
  assert.throws(
    () =>
      toVisualizationConfig({
        rootDir: 'src',
        rules: [layersTopDown('app', [routes, components, lib])],
        modules: [module('src/nowhere/thing')],
      }),
    /does not sit under any layer/,
  );
});

test('sharedWith referencing unknown feature throws', () => {
  assert.throws(
    () =>
      toVisualizationConfig({
        rootDir: 'src',
        rules: [layersTopDown('app', [routes, components, lib])],
        features: [feature('orders')],
        modules: [
          module('src/lib/format', {
            feature: 'orders',
            sharedWith: ['ghost'],
          }),
        ],
      }),
    /unknown feature "ghost"/,
  );
});

test('feature reference to unknown feature throws', () => {
  assert.throws(
    () =>
      toVisualizationConfig({
        rootDir: 'src',
        rules: [layersTopDown('app', [routes, components, lib])],
        features: [feature('orders')],
        modules: [module('src/routes/billing', { feature: 'ghost' })],
      }),
    /unknown feature "ghost"/,
  );
});

test('duplicate module path throws', () => {
  assert.throws(
    () =>
      toVisualizationConfig({
        rootDir: 'src',
        rules: [layersTopDown('app', [routes, components, lib])],
        modules: [module('src/routes/orders'), module('src/routes/orders')],
      }),
    /Duplicate module path/,
  );
});

test('resolved modules carry name, layer, feature, visibility', () => {
  const cfg = baseConfig({
    modules: [
      module('src/routes/orders', { feature: 'orders' }),
      module('src/lib/format', {
        feature: 'orders',
        sharedWith: ['billing'],
      }),
    ],
  });
  expect_deepEqual(cfg.modules, [
    {
      path: 'src/routes/orders',
      name: 'orders',
      layer: 'routes',
      feature: 'orders',
      visibility: 'private',
    },
    {
      path: 'src/lib/format',
      name: 'format',
      layer: 'lib',
      feature: 'orders',
      visibility: 'shared',
      sharedWith: ['billing'],
    },
  ]);
});

test('private within the same feature is legal', () => {
  const cfg = baseConfig({
    modules: [
      module('src/routes/orders', { feature: 'orders' }),
      module('src/components/order', { feature: 'orders' }),
    ],
  });
  const summary = summarize(
    {
      modules: [
        {
          source: 'src/routes/orders/page.ts',
          dependencies: [dependency('src/components/order/view.tsx')],
        },
        { source: 'src/components/order/view.tsx', dependencies: [] },
      ],
      summary: { violations: [] },
    },
    cfg,
  );
  expect_deepEqual(summary.breaches, []);
  expect_deepEqual(summary.featureEdges, []);
});

test('private cross-feature is a breach', () => {
  const cfg = baseConfig({
    modules: [
      module('src/routes/orders', { feature: 'orders' }),
      module('src/components/bill', { feature: 'billing' }),
    ],
  });
  const summary = summarize(
    {
      modules: [
        {
          source: 'src/routes/orders/page.ts',
          dependencies: [dependency('src/components/bill/view.tsx')],
        },
        { source: 'src/components/bill/view.tsx', dependencies: [] },
      ],
      summary: { violations: [] },
    },
    cfg,
  );
  expect_equal(summary.breaches.length, 1);
  expect_equal(summary.breaches[0]!.reason, 'private-cross-feature');
  expect_equal(summary.breaches[0]!.fromFeature, 'orders');
  expect_equal(summary.breaches[0]!.toFeature, 'billing');
});

test('public module is usable by anyone', () => {
  const cfg = baseConfig({
    modules: [
      module('src/routes/orders', { feature: 'orders' }),
      module('src/lib/format', { feature: 'billing', visibility: 'public' }),
    ],
  });
  const summary = summarize(
    {
      modules: [
        {
          source: 'src/routes/orders/page.ts',
          dependencies: [dependency('src/lib/format/money.ts')],
        },
        { source: 'src/lib/format/money.ts', dependencies: [] },
      ],
      summary: { violations: [] },
    },
    cfg,
  );
  expect_deepEqual(summary.breaches, []);
  expect_deepEqual(summary.featureEdges, [
    { from: 'orders', to: 'billing', via: ['format'] },
  ]);
  expect_deepEqual(summary.moduleEdges, [
    {
      fromLayer: 'routes',
      fromModule: 'orders',
      toLayer: 'lib',
      toModule: 'format',
      kind: 'legal',
    },
  ]);
});

test('shared honored only for listed features', () => {
  const cfg = baseConfig({
    modules: [
      module('src/routes/orders', { feature: 'orders' }),
      module('src/routes/billing', { feature: 'billing' }),
      module('src/lib/format', {
        feature: 'orders',
        sharedWith: ['billing'],
      }),
    ],
  });
  const summary = summarize(
    {
      modules: [
        {
          source: 'src/routes/billing/page.ts',
          dependencies: [dependency('src/lib/format/money.ts')],
        },
        { source: 'src/lib/format/money.ts', dependencies: [] },
      ],
      summary: { violations: [] },
    },
    cfg,
  );
  expect_deepEqual(summary.breaches, []);
  expect_deepEqual(summary.featureEdges, [
    { from: 'billing', to: 'orders', via: ['format'] },
  ]);
});

test('shared not-in-shared-with is a breach', () => {
  const cfg = toVisualizationConfig({
    rootDir: 'src',
    rules: [layersTopDown('app', [routes, components, lib])],
    features: [feature('orders'), feature('billing'), feature('other')],
    modules: [
      module('src/routes/other', { feature: 'other' }),
      module('src/lib/format', {
        feature: 'orders',
        sharedWith: ['billing'],
      }),
    ],
  });
  const summary = summarize(
    {
      modules: [
        {
          source: 'src/routes/other/page.ts',
          dependencies: [dependency('src/lib/format/money.ts')],
        },
        { source: 'src/lib/format/money.ts', dependencies: [] },
      ],
      summary: { violations: [] },
    },
    cfg,
  );
  expect_equal(summary.breaches.length, 1);
  expect_equal(summary.breaches[0]!.reason, 'not-in-shared-with');
  expect_deepEqual(summary.moduleEdges, [
    {
      fromLayer: 'routes',
      fromModule: 'other',
      toLayer: 'lib',
      toModule: 'format',
      kind: 'breach',
    },
  ]);
});

test('shared module consuming a target outside its audience is a breach', () => {
  const cfg = baseConfig({
    modules: [
      module('src/components/cart', { sharedWith: ['orders'] }),
      module('src/lib/format', { sharedWith: ['billing'] }),
    ],
  });
  const summary = summarize(
    {
      modules: [
        {
          source: 'src/components/cart/view.tsx',
          dependencies: [dependency('src/lib/format/money.ts')],
        },
        { source: 'src/lib/format/money.ts', dependencies: [] },
      ],
      summary: { violations: [] },
    },
    cfg,
  );
  expect_equal(summary.breaches.length, 1);
  expect_equal(summary.breaches[0]!.reason, 'not-in-shared-with');
  expect_equal(summary.breaches[0]!.fromFeature, 'orders');
});

test('shared module consuming a target within its audience is legal', () => {
  const cfg = baseConfig({
    modules: [
      module('src/components/cart', { sharedWith: ['orders'] }),
      module('src/lib/format', { sharedWith: ['orders', 'billing'] }),
    ],
  });
  const summary = summarize(
    {
      modules: [
        {
          source: 'src/components/cart/view.tsx',
          dependencies: [dependency('src/lib/format/money.ts')],
        },
        { source: 'src/lib/format/money.ts', dependencies: [] },
      ],
      summary: { violations: [] },
    },
    cfg,
  );
  expect_deepEqual(summary.breaches, []);
  expect_deepEqual(summary.featureModuleEdges, [
    {
      feature: 'orders',
      module: 'format',
      layer: 'lib',
      visibility: 'shared',
      relation: 'consumes',
    },
  ]);
});

test('shared module with a wider audience breaches once per unpermitted feature', () => {
  const cfg = toVisualizationConfig({
    rootDir: 'src',
    rules: [layersTopDown('app', [routes, components, lib])],
    features: [feature('orders'), feature('billing'), feature('shipping')],
    modules: [
      module('src/components/cart', {
        sharedWith: ['orders', 'billing', 'shipping'],
      }),
      module('src/lib/format', { sharedWith: ['orders'] }),
    ],
  });
  const summary = summarize(
    {
      modules: [
        {
          source: 'src/components/cart/view.tsx',
          dependencies: [dependency('src/lib/format/money.ts')],
        },
        { source: 'src/lib/format/money.ts', dependencies: [] },
      ],
      summary: { violations: [] },
    },
    cfg,
  );
  expect_equal(summary.breaches.length, 2);
  expect_deepEqual(summary.breaches.map((b) => b.fromFeature).sort(), [
    'billing',
    'shipping',
  ]);
  expect_equal(summary.breaches[0]!.reason, 'not-in-shared-with');
});

test('infra (ownerless) importing a non-public owned module is a breach', () => {
  const cfg = baseConfig({
    modules: [
      module('src/lib/util'),
      module('src/components/order', { feature: 'orders' }),
    ],
  });
  const summary = summarize(
    {
      modules: [
        {
          source: 'src/lib/util/x.ts',
          dependencies: [dependency('src/components/order/view.tsx')],
        },
        { source: 'src/components/order/view.tsx', dependencies: [] },
      ],
      summary: { violations: [] },
    },
    cfg,
  );
  expect_equal(summary.breaches.length, 1);
  expect_equal(summary.breaches[0]!.reason, 'infra-to-owned');
  expect_equal(summary.breaches[0]!.fromFeature, null);
});

test('two ownerless infra modules importing each other is legal', () => {
  const cfg = baseConfig({
    modules: [module('src/lib/util'), module('src/lib/log')],
  });
  const summary = summarize(
    {
      modules: [
        {
          source: 'src/lib/util/x.ts',
          dependencies: [dependency('src/lib/log/y.ts')],
        },
        { source: 'src/lib/log/y.ts', dependencies: [] },
      ],
      summary: { violations: [] },
    },
    cfg,
  );
  expect_deepEqual(summary.breaches, []);
});

test('featureEdges aggregate via as a deduped set', () => {
  const cfg = baseConfig({
    modules: [
      module('src/routes/orders', { feature: 'orders' }),
      module('src/lib/a', { feature: 'billing', visibility: 'public' }),
      module('src/lib/b', { feature: 'billing', visibility: 'public' }),
    ],
  });
  const summary = summarize(
    {
      modules: [
        {
          source: 'src/routes/orders/page.ts',
          dependencies: [
            dependency('src/lib/a/x.ts'),
            dependency('src/lib/b/y.ts'),
          ],
        },
        {
          source: 'src/routes/orders/other.ts',
          dependencies: [dependency('src/lib/a/x.ts')],
        },
        { source: 'src/lib/a/x.ts', dependencies: [] },
        { source: 'src/lib/b/y.ts', dependencies: [] },
      ],
      summary: { violations: [] },
    },
    cfg,
  );
  expect_deepEqual(summary.featureEdges, [
    { from: 'orders', to: 'billing', via: ['a', 'b'] },
  ]);
});

test('coverageGaps lists layer files in no declared module', () => {
  const cfg = baseConfig({
    modules: [module('src/routes/orders', { feature: 'orders' })],
  });
  const summary = summarize(
    {
      modules: [
        { source: 'src/routes/orders/page.ts', dependencies: [] },
        { source: 'src/components/loose.ts', dependencies: [] },
        { source: 'src/outside/thing.ts', dependencies: [] },
      ],
      summary: { violations: [] },
    },
    cfg,
  );
  expect_deepEqual(summary.coverageGaps, ['src/components/loose.ts']);
});

test('emptyModules flags declared modules whose files are owned by a nested module', () => {
  const cfg = baseConfig({
    modules: [
      // Parent owns no files of its own — everything lives in the nested module.
      module('src/lib/orders', { feature: 'orders' }),
      module('src/lib/orders/reservation', { feature: 'orders' }),
    ],
  });
  const summary = summarize(
    {
      modules: [
        { source: 'src/lib/orders/reservation/a.ts', dependencies: [] },
        { source: 'src/lib/orders/reservation/b.ts', dependencies: [] },
      ],
      summary: { violations: [] },
    },
    cfg,
  );
  expect_deepEqual(summary.emptyModules, [
    { path: 'src/lib/orders', layer: 'lib', name: 'orders' },
  ]);
});

test('moduleCoverage lists files per module with metadata', () => {
  const cfg = baseConfig({
    modules: [
      module('src/routes/orders', { feature: 'orders' }),
      module('src/lib/format', {
        feature: 'orders',
        sharedWith: ['billing'],
      }),
    ],
  });
  const summary = summarize(
    {
      modules: [
        { source: 'src/routes/orders/page.ts', dependencies: [] },
        { source: 'src/lib/format/money.ts', dependencies: [] },
      ],
      summary: { violations: [] },
    },
    cfg,
  );
  expect_deepEqual(summary.moduleCoverage, [
    {
      module: 'orders',
      layer: 'routes',
      visibility: 'private',
      feature: 'orders',
      files: ['src/routes/orders/page.ts'],
    },
    {
      module: 'format',
      layer: 'lib',
      visibility: 'shared',
      feature: 'orders',
      sharedWith: ['billing'],
      files: ['src/lib/format/money.ts'],
    },
  ]);
});

test('layer violations are still reported', () => {
  const cfg = baseConfig();
  const summary = summarize(
    {
      modules: [],
      summary: {
        violations: [
          {
            from: 'src/lib/format/money.ts',
            to: 'src/routes/orders/page.ts',
            rule: { name: 'no-upward', severity: 'error' },
          },
        ],
      },
    },
    cfg,
  );
  expect_equal(summary.violations.length, 1);
  expect_equal(summary.violations[0]!.from, 'lib');
  expect_equal(summary.violations[0]!.to, 'routes');
});

test('featureModuleEdges: consuming another feature shared module is consumes', () => {
  const cfg = baseConfig({
    modules: [
      module('src/routes/billing', { feature: 'billing' }),
      module('src/lib/format', {
        feature: 'orders',
        sharedWith: ['billing'],
      }),
    ],
  });
  const summary = summarize(
    {
      modules: [
        {
          source: 'src/routes/billing/page.ts',
          dependencies: [dependency('src/lib/format/money.ts')],
        },
        { source: 'src/lib/format/money.ts', dependencies: [] },
      ],
      summary: { violations: [] },
    },
    cfg,
  );
  expect_deepEqual(summary.featureModuleEdges, [
    {
      feature: 'billing',
      module: 'format',
      layer: 'lib',
      visibility: 'shared',
      relation: 'consumes',
    },
  ]);
});

test('featureModuleEdges: consuming a public module is consumes', () => {
  const cfg = baseConfig({
    modules: [
      module('src/routes/orders', { feature: 'orders' }),
      module('src/lib/format', { feature: 'billing', visibility: 'public' }),
    ],
  });
  const summary = summarize(
    {
      modules: [
        {
          source: 'src/routes/orders/page.ts',
          dependencies: [dependency('src/lib/format/money.ts')],
        },
        { source: 'src/lib/format/money.ts', dependencies: [] },
      ],
      summary: { violations: [] },
    },
    cfg,
  );
  expect_deepEqual(summary.featureModuleEdges, [
    {
      feature: 'orders',
      module: 'format',
      layer: 'lib',
      visibility: 'public',
      relation: 'consumes',
    },
  ]);
});

test('featureModuleEdges: importing own shared module is owns', () => {
  const cfg = baseConfig({
    modules: [
      module('src/routes/orders', { feature: 'orders' }),
      module('src/lib/format', {
        feature: 'orders',
        sharedWith: ['billing'],
      }),
    ],
  });
  const summary = summarize(
    {
      modules: [
        {
          source: 'src/routes/orders/page.ts',
          dependencies: [dependency('src/lib/format/money.ts')],
        },
        { source: 'src/lib/format/money.ts', dependencies: [] },
      ],
      summary: { violations: [] },
    },
    cfg,
  );
  expect_deepEqual(summary.featureModuleEdges, [
    {
      feature: 'orders',
      module: 'format',
      layer: 'lib',
      visibility: 'shared',
      relation: 'owns',
    },
  ]);
});

test('featureModuleEdges: deduped and sorted across many imports', () => {
  const cfg = toVisualizationConfig({
    rootDir: 'src',
    rules: [layersTopDown('app', [routes, components, lib])],
    features: [feature('orders'), feature('billing')],
    modules: [
      module('src/routes/orders', { feature: 'orders' }),
      module('src/routes/billing', { feature: 'billing' }),
      module('src/lib/zed', { feature: 'orders', visibility: 'public' }),
      module('src/lib/abc', {
        feature: 'orders',
        sharedWith: ['billing'],
      }),
    ],
  });
  const summary = summarize(
    {
      modules: [
        {
          source: 'src/routes/billing/page.ts',
          dependencies: [
            dependency('src/lib/abc/x.ts'),
            dependency('src/lib/zed/y.ts'),
          ],
        },
        {
          source: 'src/routes/billing/other.ts',
          dependencies: [dependency('src/lib/abc/x.ts')],
        },
        {
          source: 'src/routes/orders/page.ts',
          dependencies: [dependency('src/lib/abc/x.ts')],
        },
        { source: 'src/lib/abc/x.ts', dependencies: [] },
        { source: 'src/lib/zed/y.ts', dependencies: [] },
      ],
      summary: { violations: [] },
    },
    cfg,
  );
  expect_deepEqual(summary.featureModuleEdges, [
    {
      feature: 'billing',
      module: 'abc',
      layer: 'lib',
      visibility: 'shared',
      relation: 'consumes',
    },
    {
      feature: 'billing',
      module: 'zed',
      layer: 'lib',
      visibility: 'public',
      relation: 'consumes',
    },
    {
      feature: 'orders',
      module: 'abc',
      layer: 'lib',
      visibility: 'shared',
      relation: 'owns',
    },
  ]);
});

/** Minimal cruise-result fixture shape accepted by the tests. */
type CruiseFixture = {
  modules: { source: string; dependencies: ReturnType<typeof dependency>[] }[];
  summary: { violations: Record<string, unknown>[] };
};

/** Type-checked wrapper that adapts the minimal fixtures to the full ICruiseResult. */
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
