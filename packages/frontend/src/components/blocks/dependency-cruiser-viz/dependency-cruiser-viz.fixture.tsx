import {
  feature,
  layer,
  layersTopDown,
  module,
  toVisualizationConfig,
  type VizSummary,
} from 'depcruise-viz';

import { DependencyCruiserViz } from './dependency-cruiser-viz';

const backend = layersTopDown('backend', [
  layer('server', ['src/server'], {
    description: 'HTTP handlers & entry point',
  }),
  layer('orchestrator', ['src/orchestrator']),
  layer('services', ['src/services']),
  layer('domain', ['src/domain']),
]);

const frontend = layersTopDown('frontend', [
  layer('routes', ['src/routes'], { description: 'Page-level UI components' }),
  layer('domain', ['src/domain']),
]);

const simpleConfig = toVisualizationConfig({
  rootDir: 'src',
  rules: [
    layersTopDown('app', [
      layer('ui', ['src/ui']),
      layer('core', ['src/core']),
    ]),
  ],
});

const fullConfig = toVisualizationConfig({
  rootDir: 'src',
  rules: [backend, frontend],
});

const fullConfigWithFeatures = toVisualizationConfig({
  rootDir: 'src',
  rules: [backend, frontend],
  features: [
    feature('auth', {
      description: 'Authentication & session management',
    }),
    feature('orders', { description: 'Order processing pipeline' }),
    feature('shared', {
      description: 'Shared utilities and cross-cutting concerns',
    }),
    feature('dashboard', { description: 'Observability dashboard routes' }),
  ],
  modules: [
    module('src/server/auth', { feature: 'auth' }),
    module('src/services/auth', { feature: 'auth' }),
    module('src/orchestrator/pipeline', { feature: 'orders' }),
    module('src/orchestrator/workflow', { feature: 'orders' }),
    module('src/domain/order', { feature: 'orders' }),
    // A shared module owned by `shared`, consumed by both other features.
    module('src/domain/types', {
      feature: 'shared',
      sharedWith: ['auth', 'orders'],
    }),
    // A public utility importable by everyone (axis-3 public cluster).
    module('src/domain/logger', { feature: 'shared', visibility: 'public' }),
    // A private module of `shared` that `auth` illegally reaches into.
    module('src/domain/user', { feature: 'shared' }),
    // Nested modules: `otel` is a declared module whose path is a prefix of the
    // deeper declared module `otel/internal` (exercises Change 2).
    module('src/routes/otel', { feature: 'dashboard' }),
    module('src/routes/otel/internal', { feature: 'dashboard' }),
  ],
});

const fullSummary: VizSummary = {
  ignoredFiles: ['src/styles.css'],
  violations: [
    {
      from: 'domain',
      to: 'server',
      fromFile: 'src/domain/user.ts',
      toFile: 'src/server/handler.ts',
      rule: 'backend: domain cannot import server',
      severity: 'error',
    },
    {
      from: 'services',
      to: 'orchestrator',
      fromFile: 'src/services/auth.ts',
      toFile: 'src/orchestrator/pipeline.ts',
      rule: 'backend: services cannot import orchestrator',
      severity: 'error',
    },
  ],
  layerOrphanFiles: [
    'src/scripts/seed.ts',
    'src/scripts/migrate.ts',
    'src/types/global.d.ts',
    'src/utils/logger.ts',
  ],
  coveredFiles: [
    {
      layer: 'server',
      files: [
        'src/server/handler.ts',
        'src/server/middleware.ts',
        'src/server/index.ts',
      ],
    },
    {
      layer: 'orchestrator',
      files: ['src/orchestrator/pipeline.ts', 'src/orchestrator/workflow.ts'],
    },
    {
      layer: 'services',
      files: [
        'src/services/auth.ts',
        'src/services/user-service.ts',
        'src/services/email.ts',
      ],
    },
    {
      layer: 'domain',
      files: [
        'src/domain/user.ts',
        'src/domain/order.ts',
        'src/domain/types.ts',
        'src/domain/logger.ts',
      ],
    },
    {
      layer: 'routes',
      files: [
        'src/routes/index.tsx',
        'src/routes/login.tsx',
        'src/routes/dashboard.tsx',
        'src/routes/otel/panel.tsx',
        'src/routes/otel/internal/trace-store.ts',
      ],
    },
  ],
  moduleCoverage: [],
  coverageGaps: [],
  conflicts: [],
  breaches: [],
  featureEdges: [],
  featureModuleEdges: [],
};

const fullSummaryWithFeatures: VizSummary = {
  ...fullSummary,
  moduleCoverage: [
    {
      module: 'auth',
      layer: 'server',
      feature: 'auth',
      visibility: 'private',
      files: ['src/server/handler.ts'],
    },
    {
      module: 'auth',
      layer: 'services',
      feature: 'auth',
      visibility: 'private',
      files: ['src/services/auth.ts'],
    },
    {
      module: 'pipeline',
      layer: 'orchestrator',
      feature: 'orders',
      visibility: 'private',
      files: ['src/orchestrator/pipeline.ts'],
    },
    {
      module: 'workflow',
      layer: 'orchestrator',
      feature: 'orders',
      visibility: 'private',
      files: ['src/orchestrator/workflow.ts'],
    },
    {
      module: 'order',
      layer: 'domain',
      feature: 'orders',
      visibility: 'private',
      files: ['src/domain/order.ts'],
    },
    {
      module: 'types',
      layer: 'domain',
      feature: 'shared',
      visibility: 'shared',
      sharedWith: ['auth', 'orders'],
      files: ['src/domain/types.ts'],
    },
    {
      module: 'logger',
      layer: 'domain',
      feature: 'shared',
      visibility: 'public',
      files: ['src/domain/logger.ts'],
    },
    {
      module: 'user',
      layer: 'domain',
      feature: 'shared',
      visibility: 'private',
      files: ['src/domain/user.ts'],
    },
    {
      module: 'otel',
      layer: 'routes',
      feature: 'dashboard',
      visibility: 'private',
      files: ['src/routes/otel/panel.tsx'],
    },
    {
      module: 'otel/internal',
      layer: 'routes',
      feature: 'dashboard',
      visibility: 'private',
      files: ['src/routes/otel/internal/trace-store.ts'],
    },
  ],
  // `src/server/middleware.ts` sits in the server layer but no module owns it.
  coverageGaps: ['src/server/middleware.ts'],
  // `otel` (a routes sub-layer) overlaps the `routes` layer path, so files
  // under it match both — demoing the Conflicts section.
  conflicts: [
    {
      layerA: 'otel',
      layerB: 'routes',
      pathA: 'src/routes/otel',
      pathB: 'src/routes',
    },
  ],
  breaches: [
    {
      fromModule: 'auth',
      fromFeature: 'auth',
      toModule: 'user',
      toFeature: 'shared',
      toVisibility: 'private',
      fromFile: 'src/services/auth.ts',
      toFile: 'src/domain/user.ts',
      reason: 'private-cross-feature',
    },
    // `dashboard` illegally reaches into a private `orders` module.
    {
      fromModule: 'otel',
      fromFeature: 'dashboard',
      toModule: 'pipeline',
      toFeature: 'orders',
      toVisibility: 'private',
      fromFile: 'src/routes/otel/panel.tsx',
      toFile: 'src/orchestrator/pipeline.ts',
      reason: 'private-cross-feature',
    },
  ],
  featureEdges: [
    // auth and orders both legally consume the shared `types` module.
    { from: 'auth', to: 'shared', via: ['types'] },
    { from: 'orders', to: 'shared', via: ['types'] },
    // dashboard legally consumes the shared `types` module too.
    { from: 'dashboard', to: 'shared', via: ['types'] },
  ],
  featureModuleEdges: [
    // `shared` OWNS the axis-3 shared `types` and public `logger` modules.
    {
      feature: 'shared',
      module: 'types',
      layer: 'domain',
      visibility: 'shared',
      relation: 'owns',
    },
    {
      feature: 'shared',
      module: 'logger',
      layer: 'domain',
      visibility: 'public',
      relation: 'owns',
    },
    // `auth` and `orders` CONSUME the shared `types` (cross-feature borrow).
    {
      feature: 'auth',
      module: 'types',
      layer: 'domain',
      visibility: 'shared',
      relation: 'consumes',
    },
    {
      feature: 'orders',
      module: 'types',
      layer: 'domain',
      visibility: 'shared',
      relation: 'consumes',
    },
    // `auth` CONSUMES the public `logger` util.
    {
      feature: 'auth',
      module: 'logger',
      layer: 'domain',
      visibility: 'public',
      relation: 'consumes',
    },
  ],
};

const fullHeight = (node: React.ReactNode) => (
  <div className="h-svh">{node}</div>
);

export default {
  simple: fullHeight(
    <DependencyCruiserViz config={simpleConfig} summary={fullSummary} />,
  ),
  'graph-only': fullHeight(<DependencyCruiserViz config={fullConfig} />),
  full: fullHeight(
    <DependencyCruiserViz config={fullConfig} summary={fullSummary} />,
  ),
  'with-features': fullHeight(
    <DependencyCruiserViz
      config={fullConfigWithFeatures}
      summary={fullSummaryWithFeatures}
    />,
  ),
};
