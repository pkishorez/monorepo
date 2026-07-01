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
      root: 'auth',
      modules: ['auth', 'auth', 'types', 'logger'],
      description: 'Authentication & session management',
    }),
    feature('orders', {
      root: 'pipeline',
      modules: ['pipeline', 'workflow', 'order', 'types'],
      description: 'Order processing pipeline',
    }),
    feature('shared', {
      root: 'types',
      modules: ['types', 'logger', 'user'],
      description: 'Shared utilities and cross-cutting concerns',
    }),
    feature('dashboard', {
      root: 'otel',
      modules: ['otel', 'otel/internal'],
      description: 'Observability dashboard routes',
    }),
  ],
  modules: [
    module('src/server/auth'),
    module('src/services/auth'),
    module('src/orchestrator/pipeline'),
    module('src/orchestrator/workflow'),
    module('src/domain/order'),
    module('src/domain/types'),
    module('src/domain/logger', { barrel: true }),
    module('src/domain/user'),
    module('src/routes/otel'),
    module('src/routes/otel/internal'),
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
  emptyModules: [],
  conflicts: [],
  moduleEdges: [],
  featureGraphs: [],
  closureViolations: [],
};

const fullSummaryWithFeatures: VizSummary = {
  ...fullSummary,
  moduleCoverage: [
    {
      module: 'auth',
      layer: 'server',
      files: ['src/server/handler.ts'],
    },
    {
      module: 'auth',
      layer: 'services',
      files: ['src/services/auth.ts'],
    },
    {
      module: 'pipeline',
      layer: 'orchestrator',
      files: ['src/orchestrator/pipeline.ts'],
    },
    {
      module: 'workflow',
      layer: 'orchestrator',
      files: ['src/orchestrator/workflow.ts'],
    },
    {
      module: 'order',
      layer: 'domain',
      files: ['src/domain/order.ts'],
    },
    {
      module: 'types',
      layer: 'domain',
      files: ['src/domain/types.ts'],
    },
    {
      module: 'logger',
      layer: 'domain',
      files: ['src/domain/logger.ts'],
    },
    {
      module: 'user',
      layer: 'domain',
      files: ['src/domain/user.ts'],
    },
    {
      module: 'otel',
      layer: 'routes',
      files: ['src/routes/otel/panel.tsx'],
    },
    {
      module: 'otel/internal',
      layer: 'routes',
      files: ['src/routes/otel/internal/trace-store.ts'],
    },
  ],
  coverageGaps: ['src/server/middleware.ts'],
  emptyModules: [],
  conflicts: [
    {
      layerA: 'otel',
      layerB: 'routes',
      pathA: 'src/routes/otel',
      pathB: 'src/routes',
    },
  ],
  moduleEdges: [
    // auth's internal slice.
    {
      fromLayer: 'server',
      fromModule: 'auth',
      toLayer: 'services',
      toModule: 'auth',
      kind: 'legal',
    },
    {
      fromLayer: 'services',
      fromModule: 'auth',
      toLayer: 'domain',
      toModule: 'types',
      kind: 'legal',
    },
    {
      fromLayer: 'server',
      fromModule: 'auth',
      toLayer: 'domain',
      toModule: 'logger',
      kind: 'legal',
    },
    // orders' internal slice.
    {
      fromLayer: 'orchestrator',
      fromModule: 'pipeline',
      toLayer: 'orchestrator',
      toModule: 'workflow',
      kind: 'legal',
    },
    {
      fromLayer: 'orchestrator',
      fromModule: 'workflow',
      toLayer: 'domain',
      toModule: 'order',
      kind: 'legal',
    },
    {
      fromLayer: 'domain',
      fromModule: 'order',
      toLayer: 'domain',
      toModule: 'types',
      kind: 'legal',
    },
  ],
  featureGraphs: [
    {
      feature: 'auth',
      root: 'server::auth',
      nodes: [
        'server::auth',
        'services::auth',
        'domain::types',
        'domain::logger',
      ],
      edges: [
        { from: 'server::auth', to: 'services::auth', kind: 'legal' },
        { from: 'services::auth', to: 'domain::types', kind: 'legal' },
        { from: 'server::auth', to: 'domain::logger', kind: 'legal' },
      ],
    },
    {
      feature: 'orders',
      root: 'orchestrator::pipeline',
      nodes: [
        'orchestrator::pipeline',
        'orchestrator::workflow',
        'domain::order',
        'domain::types',
      ],
      edges: [
        {
          from: 'orchestrator::pipeline',
          to: 'orchestrator::workflow',
          kind: 'legal',
        },
        { from: 'orchestrator::workflow', to: 'domain::order', kind: 'legal' },
        { from: 'domain::order', to: 'domain::types', kind: 'legal' },
      ],
    },
    {
      feature: 'shared',
      root: 'domain::types',
      nodes: ['domain::types', 'domain::logger', 'domain::user'],
      edges: [],
    },
    {
      feature: 'dashboard',
      root: 'routes::otel',
      nodes: ['routes::otel', 'routes::otel/internal'],
      edges: [
        { from: 'routes::otel', to: 'orchestrator::pipeline', kind: 'breach' },
      ],
    },
  ],
  closureViolations: [
    {
      reason: 'closure-escape',
      feature: 'auth',
      fromModule: 'services::auth',
      toModule: 'domain::user',
      fromFile: 'src/services/auth.ts',
      toFile: 'src/domain/user.ts',
      detail: 'auth imports domain::user which is not a declared member',
    },
    {
      reason: 'closure-escape',
      feature: 'dashboard',
      fromModule: 'routes::otel',
      toModule: 'orchestrator::pipeline',
      fromFile: 'src/routes/otel/panel.tsx',
      toFile: 'src/orchestrator/pipeline.ts',
      detail:
        'dashboard imports orchestrator::pipeline which is not a declared member',
    },
  ],
};

// Grouped config: multiple independent stacks.
const dynamodbStack = layersTopDown('dynamodb', [
  layer('dynamodb-barrel', ['src/db/dynamodb/index.ts']),
  layer('services', ['src/db/dynamodb/services']),
  layer('internal', ['src/db/dynamodb/internal']),
]);

const sqliteStack = layersTopDown('sqlite', [
  layer('sqlite-barrel', ['src/db/sqlite/index.ts']),
  layer('sqlite-impl', ['src/db/sqlite/impl']),
]);

const apiStack = layersTopDown('api', [
  layer('routes', ['src/api/routes']),
  layer('internal', ['src/api/internal']),
]);

const ungroupedStack = layersTopDown('scripts', [
  layer('cli', ['src/scripts/cli']),
  layer('lib', ['src/scripts/lib']),
]);

const groupedConfig = toVisualizationConfig({
  rootDir: 'src',
  rules: [dynamodbStack, sqliteStack, apiStack, ungroupedStack],
});

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
  grouped: fullHeight(<DependencyCruiserViz config={groupedConfig} />),
};
