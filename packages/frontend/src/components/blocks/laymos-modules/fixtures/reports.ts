import type { LaymosReport } from 'laymos/report';

export const moduleArchitectureReport: LaymosReport = {
  architecture: {
    sourceRoots: ['src'],
    layers: {
      ui: { paths: ['src/ui'], description: 'User-facing entry points' },
      application: {
        paths: ['src/application'],
        description: 'Application workflows',
      },
      jobs: { paths: ['src/jobs'], description: 'Background entry points' },
      domain: { paths: ['src/domain'], description: 'Shared business model' },
    },
    graphs: [
      {
        name: 'web',
        description: 'Interactive application',
        layers: ['ui', 'application', 'domain'],
        edges: [
          { from: 'ui', to: 'application' },
          { from: 'application', to: 'domain' },
        ],
      },
      {
        name: 'workers',
        description: 'Background processing',
        layers: ['jobs', 'domain'],
        edges: [{ from: 'jobs', to: 'domain' }],
      },
    ],
    modules: {
      'src/ui/orders': { description: 'Order screens' },
      'src/ui/accounts': { description: 'Account screens' },
      'src/application/orders': { description: 'Order workflows' },
      'src/application/accounts': { description: 'Account workflows' },
      'src/jobs/reconcile': { description: 'Account reconciliation' },
      'src/domain/orders': { description: 'Order business rules' },
      'src/domain/accounts': { description: 'Account business rules' },
    },
    moduleGroups: {},
    moduleRules: [],
    ignoredPaths: [],
  },
  files: {
    'src/ui/orders/index.ts': {
      kind: 'covered',
      layer: 'ui',
      module: 'src/ui/orders',
      imports: ['src/application/orders/index.ts'],
    },
    'src/ui/accounts/index.ts': {
      kind: 'covered',
      layer: 'ui',
      module: 'src/ui/accounts',
      imports: ['src/application/accounts/index.ts'],
    },
    'src/application/orders/index.ts': {
      kind: 'covered',
      layer: 'application',
      module: 'src/application/orders',
      imports: ['src/domain/orders/index.ts', 'src/domain/accounts/index.ts'],
    },
    'src/application/accounts/index.ts': {
      kind: 'covered',
      layer: 'application',
      module: 'src/application/accounts',
      imports: ['src/domain/accounts/index.ts'],
    },
    'src/jobs/reconcile/index.ts': {
      kind: 'covered',
      layer: 'jobs',
      module: 'src/jobs/reconcile',
      imports: ['src/domain/accounts/index.ts'],
    },
    'src/domain/orders/index.ts': {
      kind: 'covered',
      layer: 'domain',
      module: 'src/domain/orders',
      imports: ['src/domain/accounts/index.ts'],
    },
    'src/domain/accounts/index.ts': {
      kind: 'covered',
      layer: 'domain',
      module: 'src/domain/accounts',
      imports: [],
    },
  },
  violations: [
    {
      kind: 'module',
      rule: 'canImport',
      from: {
        module: 'src/application/orders',
        layer: 'application',
        file: 'src/application/orders/index.ts',
      },
      to: {
        module: 'src/domain/accounts',
        layer: 'domain',
        file: 'src/domain/accounts/index.ts',
      },
    },
  ],
  coverage: {
    layers: { totalFiles: 7, coveredFiles: 7, uncovered: [] },
    modules: [
      { layer: 'ui', totalFiles: 2, coveredFiles: 2, uncovered: [] },
      {
        layer: 'application',
        totalFiles: 2,
        coveredFiles: 2,
        uncovered: [],
      },
      { layer: 'jobs', totalFiles: 1, coveredFiles: 1, uncovered: [] },
      { layer: 'domain', totalFiles: 2, coveredFiles: 2, uncovered: [] },
    ],
  },
  warnings: [],
};

function buildDenseModuleReport(): LaymosReport {
  const layers = ['entry', 'application', 'domain', 'platform'];
  const modules: Record<string, { description: string }> = {};
  const files: Record<string, LaymosReport['files'][string]> = {};
  for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
    const layer = layers[layerIndex]!;
    for (let moduleIndex = 0; moduleIndex < 14; moduleIndex += 1) {
      const path = `src/${layer}/capability-${moduleIndex + 1}`;
      const file = `${path}/index.ts`;
      modules[path] = { description: `${layer} capability` };
      const nextLayer = layers[layerIndex + 1];
      files[file] = {
        kind: 'covered',
        layer,
        module: path,
        imports:
          nextLayer && moduleIndex % 2 === 0
            ? [`src/${nextLayer}/capability-${moduleIndex + 1}/index.ts`]
            : [],
      };
    }
  }
  return {
    architecture: {
      sourceRoots: ['src'],
      layers: Object.fromEntries(
        layers.map((layer) => [layer, { paths: [`src/${layer}`] }]),
      ),
      graphs: [
        {
          name: 'dense',
          layers,
          edges: layers.slice(0, -1).map((from, index) => ({
            from,
            to: layers[index + 1]!,
          })),
        },
      ],
      modules,
      moduleGroups: {},
      moduleRules: [],
      ignoredPaths: [],
    },
    files,
    violations: [],
    coverage: {
      layers: { totalFiles: 56, coveredFiles: 56, uncovered: [] },
      modules: layers.map((layer) => ({
        layer,
        totalFiles: 14,
        coveredFiles: 14,
        uncovered: [],
      })),
    },
    warnings: [],
  };
}

export const denseModuleArchitectureReport = buildDenseModuleReport();

function capabilityGroup(
  layer: string,
  description: string,
  indices: readonly number[],
): { description: string; modules: string[] } {
  return {
    description,
    modules: indices.map((index) => `src/${layer}/capability-${index}`),
  };
}

/**
 * A dense report whose crowded layers are chunked with Module Groups. The
 * `application` layer keeps an ungrouped tail (capabilities 13–14) so the
 * layout's grouped bands and bare tail are both exercised, while `entry` and
 * `platform` stay ungrouped to prove mixed layers render together. A few
 * intra-group imports are added so expanded Groups split into seed, core, and
 * leaf bands.
 */
function buildGroupedModuleReport(): LaymosReport {
  const dense = buildDenseModuleReport();
  const files: Record<string, LaymosReport['files'][string]> = {};
  for (const [path, file] of Object.entries(dense.files)) {
    files[path] = { ...file, imports: [...file.imports] };
  }
  const link = (layer: string, from: number, to: number): void => {
    const fromPath = `src/${layer}/capability-${from}/index.ts`;
    const toPath = `src/${layer}/capability-${to}/index.ts`;
    const file = files[fromPath];
    if (file?.kind === 'covered' && !file.imports.includes(toPath)) {
      files[fromPath] = { ...file, imports: [...file.imports, toPath] };
    }
  };
  // domain-accounts: 1 → 2 → 3 (seed → core → leaf); 4–7 stay seeds.
  link('domain', 1, 2);
  link('domain', 2, 3);
  // application-orders: 1 → 2 → 3 → 4 (seed → core → core → leaf).
  link('application', 1, 2);
  link('application', 2, 3);
  link('application', 3, 4);

  return {
    ...dense,
    files,
    architecture: {
      ...dense.architecture,
      moduleGroups: {
        'application-orders': capabilityGroup(
          'application',
          'Order and checkout workflows',
          [1, 2, 3, 4],
        ),
        'application-billing': capabilityGroup(
          'application',
          'Billing and invoicing workflows',
          [5, 6, 7, 8],
        ),
        'application-catalog': capabilityGroup(
          'application',
          'Catalog and search workflows',
          [9, 10, 11, 12],
        ),
        'domain-accounts': capabilityGroup(
          'domain',
          'Account and identity model',
          [1, 2, 3, 4, 5, 6, 7],
        ),
        'domain-ledger': capabilityGroup(
          'domain',
          'Ledger and pricing model',
          [8, 9, 10, 11, 12, 13, 14],
        ),
      },
    },
  };
}

export const groupedModuleArchitectureReport = buildGroupedModuleReport();
