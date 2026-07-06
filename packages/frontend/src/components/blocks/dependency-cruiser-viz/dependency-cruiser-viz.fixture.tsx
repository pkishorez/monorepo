import {
  edge,
  layer,
  layerGraph,
  module,
  toVisualizationConfig,
  type VizSummary,
} from 'depcruise-viz';

import { DependencyCruiserViz } from './dependency-cruiser-viz';

const chain = (name: string, layers: ReturnType<typeof layer>[]) =>
  layerGraph(
    name,
    layers.slice(1).map((l, i) => edge(layers[i]!, l)),
  );

const backend = chain('backend', [
  layer('server', ['src/server'], {
    description: 'HTTP handlers & entry point',
  }),
  layer('orchestrator', ['src/orchestrator']),
  layer('services', ['src/services']),
  layer('domain', ['src/domain']),
]);

const frontend = chain('frontend', [
  layer('routes', ['src/routes'], { description: 'Page-level UI components' }),
  layer('domain', ['src/domain']),
]);

const simpleConfig = toVisualizationConfig({
  rootDir: 'src',
  rules: [chain('app', [layer('ui', ['src/ui']), layer('core', ['src/core'])])],
});

const fullConfig = toVisualizationConfig({
  rootDir: 'src',
  rules: [backend, frontend],
});

const fullConfigWithModules = toVisualizationConfig({
  rootDir: 'src',
  rules: [backend, frontend],
  modules: [
    module('src/server/auth'),
    module('src/services/auth'),
    module('src/orchestrator/pipeline'),
    module('src/orchestrator/workflow'),
    module('src/domain/order'),
    module('src/domain/types', { rules: { root: true } }),
    module('src/domain/logger', { opaque: true }),
    module('src/domain/user'),
    module('src/routes/otel', {
      rules: { onlyImports: ['src/routes/otel/internal'] },
    }),
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
  moduleOverlaps: [],
  moduleEdges: [],
  moduleViolations: [],
};

const fullSummaryWithModules: VizSummary = {
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
  moduleOverlaps: [
    {
      outerPath: 'src/routes/otel',
      outerLayer: 'routes',
      outerName: 'otel',
      innerPath: 'src/routes/otel/internal',
      innerLayer: 'routes',
      innerName: 'otel/internal',
    },
  ],
  // Enough edges to exercise the focus view: `types` has consumers two hops
  // up (pipeline → workflow → order → types) and `auth` chains across layers.
  moduleEdges: [
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
      kind: 'breach',
    },
    {
      fromLayer: 'services',
      fromModule: 'auth',
      toLayer: 'domain',
      toModule: 'user',
      kind: 'legal',
    },
    {
      fromLayer: 'server',
      fromModule: 'auth',
      toLayer: 'domain',
      toModule: 'logger',
      kind: 'legal',
    },
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
      kind: 'breach',
    },
    {
      fromLayer: 'routes',
      fromModule: 'otel',
      toLayer: 'orchestrator',
      toModule: 'pipeline',
      kind: 'breach',
    },
    {
      fromLayer: 'routes',
      fromModule: 'otel',
      toLayer: 'routes',
      toModule: 'otel/internal',
      kind: 'legal',
    },
  ],
  moduleViolations: [
    {
      module: 'types',
      rule: 'root',
      from: 'auth',
      to: 'types',
      fromFile: 'src/services/auth.ts',
      toFile: 'src/domain/types.ts',
    },
    {
      module: 'types',
      rule: 'root',
      from: 'order',
      to: 'types',
      fromFile: 'src/domain/order.ts',
      toFile: 'src/domain/types.ts',
    },
    {
      module: 'otel',
      rule: 'onlyImports',
      from: 'otel',
      to: 'pipeline',
      fromFile: 'src/routes/otel/panel.tsx',
      toFile: 'src/orchestrator/pipeline.ts',
    },
  ],
};

// Grouped config: multiple independent stacks.
const dynamodbStack = chain('dynamodb', [
  layer('dynamodb-barrel', ['src/db/dynamodb/index.ts']),
  layer('services', ['src/db/dynamodb/services']),
  layer('internal', ['src/db/dynamodb/internal']),
]);

const sqliteStack = chain('sqlite', [
  layer('sqlite-barrel', ['src/db/sqlite/index.ts']),
  layer('sqlite-impl', ['src/db/sqlite/impl']),
]);

const apiStack = chain('api', [
  layer('routes', ['src/api/routes']),
  layer('internal', ['src/api/internal']),
]);

const ungroupedStack = chain('scripts', [
  layer('cli', ['src/scripts/cli']),
  layer('lib', ['src/scripts/lib']),
]);

const groupedConfig = toVisualizationConfig({
  rootDir: 'src',
  rules: [dynamodbStack, sqliteStack, apiStack, ungroupedStack],
});

// Diamond: server → {entrypoints, routes} → components → lib.
const diamondConfig = (() => {
  const server = layer('server', ['src/server']);
  const entrypoints = layer('entrypoints', ['src/entrypoints']);
  const routes = layer('routes', ['src/routes']);
  const components = layer('components', ['src/components']);
  const lib = layer('lib', ['src/lib']);
  return toVisualizationConfig({
    rootDir: 'src',
    rules: [
      layerGraph('frontend', [
        edge(server, [entrypoints, routes]),
        edge(entrypoints, components),
        edge(routes, components),
        edge(components, lib),
      ]),
    ],
  });
})();

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
  'with-modules': fullHeight(
    <DependencyCruiserViz
      config={fullConfigWithModules}
      summary={fullSummaryWithModules}
    />,
  ),
  grouped: fullHeight(<DependencyCruiserViz config={groupedConfig} />),
  diamond: fullHeight(<DependencyCruiserViz config={diamondConfig} />),
};
