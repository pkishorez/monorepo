import type { LaymosReport } from 'laymos/report';

export const laymosLayersFixtureReport: LaymosReport = {
  schemaVersion: 2,
  architecture: {
    sourceRoots: ['src'],
    layers: {
      routes: {
        paths: ['src/routes'],
        description: 'Page-level composition and routing',
      },
      ui: { paths: ['src/ui'], description: 'Reusable interface components' },
      controllers: {
        paths: ['src/controllers'],
        description: 'HTTP request handling',
      },
      services: {
        paths: ['src/services'],
        description: 'Application services',
      },
      domain: {
        paths: ['src/domain'],
        description: 'Shared domain model',
      },
    },
    graphs: [
      {
        name: 'web',
        description: 'Browser application',
        layers: ['routes', 'ui', 'domain'],
        edges: [
          { from: 'routes', to: 'ui' },
          { from: 'ui', to: 'domain' },
          { from: 'routes', to: 'domain' },
        ],
      },
      {
        name: 'api',
        description: 'Server application',
        layers: ['controllers', 'services', 'domain'],
        edges: [
          { from: 'controllers', to: 'services' },
          { from: 'services', to: 'domain' },
        ],
      },
    ],
    modules: {
      'src/domain/order': { description: 'Order domain' },
      'src/services/order': { description: 'Order orchestration' },
    },
    moduleRules: [],
    ignoredPaths: ['src/generated'],
  },
  files: {
    'src/routes/home.tsx': {
      kind: 'covered',
      layer: 'routes',
      imports: ['src/ui/order-card.tsx', 'src/domain/order/order.ts'],
    },
    'src/routes/admin.tsx': {
      kind: 'covered',
      layer: 'routes',
      imports: ['src/controllers/order.ts'],
    },
    'src/ui/order-card.tsx': {
      kind: 'covered',
      layer: 'ui',
      imports: ['src/domain/order/order.ts'],
    },
    'src/controllers/order.ts': {
      kind: 'covered',
      layer: 'controllers',
      imports: ['src/services/order.ts'],
    },
    'src/services/order.ts': {
      kind: 'covered',
      layer: 'services',
      module: 'src/services/order',
      imports: ['src/domain/order/order.ts'],
    },
    'src/domain/order/order.ts': {
      kind: 'covered',
      layer: 'domain',
      module: 'src/domain/order',
      imports: ['src/domain/order/types.ts'],
    },
    'src/domain/order/types.ts': {
      kind: 'covered',
      layer: 'domain',
      module: 'src/domain/order',
      imports: [],
    },
    'src/scripts/seed.ts': { kind: 'uncovered', imports: [] },
  },
  violations: [
    {
      kind: 'layer',
      from: { layer: 'routes', file: 'src/routes/admin.tsx' },
      to: { layer: 'controllers', file: 'src/controllers/order.ts' },
    },
  ],
  coverage: {
    layers: {
      totalFiles: 8,
      coveredFiles: 7,
      uncovered: ['src/scripts/seed.ts'],
    },
    modules: [
      {
        layer: 'routes',
        totalFiles: 2,
        coveredFiles: 0,
        uncovered: ['src/routes/home.tsx', 'src/routes/admin.tsx'],
      },
      {
        layer: 'ui',
        totalFiles: 1,
        coveredFiles: 0,
        uncovered: ['src/ui/order-card.tsx'],
      },
      {
        layer: 'controllers',
        totalFiles: 1,
        coveredFiles: 0,
        uncovered: ['src/controllers/order.ts'],
      },
      {
        layer: 'services',
        totalFiles: 1,
        coveredFiles: 1,
        uncovered: [],
      },
      {
        layer: 'domain',
        totalFiles: 2,
        coveredFiles: 2,
        uncovered: [],
      },
    ],
  },
  warnings: [],
};

interface FixtureGraph {
  readonly name: string;
  readonly layers: readonly string[];
  readonly edges: readonly { readonly from: string; readonly to: string }[];
}

interface FixtureSpec {
  readonly layers: readonly string[];
  readonly graphs: readonly FixtureGraph[];
  readonly observedEdges: readonly {
    readonly from: string;
    readonly to: string;
  }[];
  readonly violatingEdges?: readonly {
    readonly from: string;
    readonly to: string;
  }[];
  readonly uncoveredLayers?: readonly string[];
}

function fixturePath(layer: string): string {
  return `src/${layer}/index.ts`;
}

function buildFixtureReport(spec: FixtureSpec): LaymosReport {
  const importsByLayer = new Map<string, string[]>();
  for (const layer of spec.layers) importsByLayer.set(layer, []);
  for (const edge of spec.observedEdges) {
    importsByLayer.get(edge.from)?.push(fixturePath(edge.to));
  }
  const uncoveredLayers = new Set(spec.uncoveredLayers ?? []);
  return {
    schemaVersion: 2,
    architecture: {
      sourceRoots: ['src'],
      layers: Object.fromEntries(
        spec.layers.map((layer) => [
          layer,
          {
            paths: [`src/${layer}`],
            description: `${layer} architecture layer`,
          },
        ]),
      ),
      graphs: spec.graphs.map((graph) => ({
        ...graph,
        description: `${graph.name} dependency graph`,
      })),
      modules: {},
      moduleRules: [],
      ignoredPaths: [],
    },
    files: Object.fromEntries(
      spec.layers.map((layer) => [
        fixturePath(layer),
        {
          kind: 'covered' as const,
          layer,
          imports: importsByLayer.get(layer) ?? [],
        },
      ]),
    ),
    violations: (spec.violatingEdges ?? []).map((edge) => ({
      kind: 'layer' as const,
      from: { layer: edge.from, file: fixturePath(edge.from) },
      to: { layer: edge.to, file: fixturePath(edge.to) },
    })),
    coverage: {
      layers: {
        totalFiles: spec.layers.length,
        coveredFiles: spec.layers.length,
        uncovered: [],
      },
      modules: spec.layers.map((layer) => ({
        layer,
        totalFiles: 1,
        coveredFiles: uncoveredLayers.has(layer) ? 0 : 1,
        uncovered: uncoveredLayers.has(layer) ? [fixturePath(layer)] : [],
      })),
    },
    warnings: [],
  };
}

export const siblingLayersFixtureReport = buildFixtureReport({
  layers: ['entry', 'catalog', 'cart', 'account', 'domain'],
  graphs: [
    {
      name: 'storefront',
      layers: ['entry', 'catalog', 'cart', 'account', 'domain'],
      edges: [
        { from: 'entry', to: 'catalog' },
        { from: 'entry', to: 'cart' },
        { from: 'entry', to: 'account' },
        { from: 'catalog', to: 'domain' },
        { from: 'cart', to: 'domain' },
        { from: 'account', to: 'domain' },
      ],
    },
  ],
  observedEdges: [
    { from: 'entry', to: 'catalog' },
    { from: 'entry', to: 'cart' },
    { from: 'entry', to: 'account' },
    { from: 'catalog', to: 'domain' },
    { from: 'cart', to: 'domain' },
    { from: 'account', to: 'domain' },
  ],
  uncoveredLayers: ['account'],
});

export const complexLayersFixtureReport = buildFixtureReport({
  layers: [
    'screens',
    'controllers',
    'jobs',
    'application',
    'billing',
    'notifications',
    'domain',
    'platform',
  ],
  graphs: [
    {
      name: 'browser',
      layers: ['screens', 'application', 'billing', 'domain', 'platform'],
      edges: [
        { from: 'screens', to: 'application' },
        { from: 'application', to: 'billing' },
        { from: 'application', to: 'domain' },
        { from: 'billing', to: 'domain' },
        { from: 'domain', to: 'platform' },
      ],
    },
    {
      name: 'server',
      layers: [
        'controllers',
        'application',
        'notifications',
        'domain',
        'platform',
      ],
      edges: [
        { from: 'controllers', to: 'application' },
        { from: 'application', to: 'notifications' },
        { from: 'application', to: 'domain' },
        { from: 'notifications', to: 'domain' },
        { from: 'domain', to: 'platform' },
      ],
    },
    {
      name: 'workers',
      layers: ['jobs', 'billing', 'notifications', 'domain', 'platform'],
      edges: [
        { from: 'jobs', to: 'billing' },
        { from: 'jobs', to: 'notifications' },
        { from: 'billing', to: 'domain' },
        { from: 'notifications', to: 'domain' },
        { from: 'domain', to: 'platform' },
      ],
    },
  ],
  observedEdges: [
    { from: 'screens', to: 'application' },
    { from: 'screens', to: 'notifications' },
    { from: 'controllers', to: 'application' },
    { from: 'controllers', to: 'billing' },
    { from: 'jobs', to: 'billing' },
    { from: 'jobs', to: 'notifications' },
    { from: 'application', to: 'billing' },
    { from: 'application', to: 'notifications' },
    { from: 'billing', to: 'domain' },
    { from: 'notifications', to: 'domain' },
    { from: 'domain', to: 'platform' },
  ],
  violatingEdges: [
    { from: 'screens', to: 'notifications' },
    { from: 'controllers', to: 'billing' },
  ],
  uncoveredLayers: ['notifications', 'platform'],
});
