import type { LaymosReport } from 'laymos/report';

export const laymosModulesFixtureReport: LaymosReport = {
  schemaVersion: 1,
  architecture: {
    layers: {
      application: {
        paths: ['src/application'],
        description: 'Application entry points',
      },
      domain: {
        paths: ['src/domain'],
        description: 'Business capabilities',
      },
      platform: {
        paths: ['src/platform'],
        description: 'Infrastructure adapters',
      },
    },
    graphs: [
      {
        name: 'application',
        layers: ['application', 'domain', 'platform'],
        edges: [
          { from: 'application', to: 'domain' },
          { from: 'domain', to: 'platform' },
        ],
      },
    ],
    modules: {
      'src/application/admin': { description: 'Administration workflows' },
      'src/application/home': { description: 'Home experience' },
      'src/application/empty': { description: 'Reserved capability' },
      'src/domain/order': { description: 'Order domain' },
      'src/domain/user': { description: 'User domain' },
      'src/platform/log': { description: 'Logging adapter' },
    },
    moduleRules: [
      {
        module: 'src/domain/order',
        canImport: ['src/domain/user'],
      },
      {
        module: 'src/application/home',
        canImportedBy: ['src/application/admin'],
      },
    ],
    ignoredPaths: [],
  },
  files: {
    'src/application/admin/index.ts': {
      kind: 'covered',
      layer: 'application',
      module: 'src/application/admin',
      imports: ['src/application/home/index.ts'],
    },
    'src/application/home/index.ts': {
      kind: 'covered',
      layer: 'application',
      module: 'src/application/home',
      imports: [
        'src/domain/order/index.ts',
        'src/domain/user/index.ts',
        'src/application/shared.ts',
      ],
    },
    'src/application/shared.ts': {
      kind: 'covered',
      layer: 'application',
      imports: ['src/application/home/index.ts'],
    },
    'src/domain/order/index.ts': {
      kind: 'covered',
      layer: 'domain',
      module: 'src/domain/order',
      imports: ['src/domain/user/index.ts', 'src/platform/log/index.ts'],
    },
    'src/domain/user/index.ts': {
      kind: 'covered',
      layer: 'domain',
      module: 'src/domain/user',
      imports: ['src/platform/log/index.ts', 'src/application/home/index.ts'],
    },
    'src/platform/log/index.ts': {
      kind: 'covered',
      layer: 'platform',
      module: 'src/platform/log',
      imports: [],
    },
  },
  violations: [
    {
      kind: 'module',
      rule: 'canImport',
      from: {
        module: 'src/domain/order',
        layer: 'domain',
        file: 'src/domain/order/index.ts',
      },
      to: {
        module: 'src/platform/log',
        layer: 'platform',
        file: 'src/platform/log/index.ts',
      },
    },
  ],
  coverage: {
    layers: { totalFiles: 6, coveredFiles: 6, uncovered: [] },
    modules: [
      {
        layer: 'application',
        totalFiles: 3,
        coveredFiles: 2,
        uncovered: ['src/application/shared.ts'],
      },
      { layer: 'domain', totalFiles: 2, coveredFiles: 2, uncovered: [] },
      { layer: 'platform', totalFiles: 1, coveredFiles: 1, uncovered: [] },
    ],
  },
  warnings: [],
};

function buildDenseReport(): LaymosReport {
  const layerNames = ['routes', 'application', 'domain', 'platform'];
  const modulesPerLayer = 8;
  const architectureModules: Record<string, { description: string }> = {};
  const files: Record<string, LaymosReport['files'][string]> = {};
  for (let layerIndex = 0; layerIndex < layerNames.length; layerIndex += 1) {
    const layer = layerNames[layerIndex]!;
    for (let index = 0; index < modulesPerLayer; index += 1) {
      const modulePath = `src/${layer}/capability-${index + 1}`;
      const filePath = `${modulePath}/index.ts`;
      architectureModules[modulePath] = {
        description: `${layer} capability ${index + 1}`,
      };
      const imports: string[] = [];
      if (index + 1 < modulesPerLayer) {
        imports.push(`src/${layer}/capability-${index + 2}/index.ts`);
      }
      if (layerIndex + 1 < layerNames.length && index % 2 === 0) {
        imports.push(
          `src/${layerNames[layerIndex + 1]}/capability-${index + 1}/index.ts`,
        );
      }
      files[filePath] = {
        kind: 'covered',
        layer,
        module: modulePath,
        imports,
      };
    }
  }
  return {
    schemaVersion: 1,
    architecture: {
      layers: Object.fromEntries(
        layerNames.map((name) => [name, { paths: [`src/${name}`] }]),
      ),
      graphs: [
        {
          name: 'dense-application',
          layers: layerNames,
          edges: layerNames.slice(0, -1).map((from, index) => ({
            from,
            to: layerNames[index + 1]!,
          })),
        },
      ],
      modules: architectureModules,
      moduleRules: [],
      ignoredPaths: [],
    },
    files,
    violations: [],
    coverage: {
      layers: { totalFiles: 32, coveredFiles: 32, uncovered: [] },
      modules: layerNames.map((layer) => ({
        layer,
        totalFiles: modulesPerLayer,
        coveredFiles: modulesPerLayer,
        uncovered: [],
      })),
    },
    warnings: [],
  };
}

export const denseModulesFixtureReport = buildDenseReport();

function buildComplexReport(): LaymosReport {
  const layerCounts = {
    routes: 8,
    ui: 8,
    controllers: 8,
    services: 8,
    jobs: 8,
    workflows: 8,
    domain: 12,
  } as const;
  const downstream = new Map([
    ['routes', 'ui'],
    ['ui', 'domain'],
    ['controllers', 'services'],
    ['services', 'domain'],
    ['jobs', 'workflows'],
    ['workflows', 'domain'],
  ]);
  const architectureModules: Record<string, { description: string }> = {};
  const files: Record<string, LaymosReport['files'][string]> = {};
  for (const [layer, count] of Object.entries(layerCounts)) {
    for (let index = 0; index < count; index += 1) {
      const number = index + 1;
      const modulePath = `src/${layer}/capability-${number}`;
      const filePath = `${modulePath}/index.ts`;
      architectureModules[modulePath] = {
        description: `${layer} capability ${number}`,
      };
      const imports: string[] = [];
      const half = Math.ceil(count / 2);
      if (index < half) {
        imports.push(
          `src/${layer}/capability-${Math.min(count, index + half + 1)}/index.ts`,
        );
      }
      const nextLayer = downstream.get(layer);
      if (nextLayer) {
        const nextCount = layerCounts[nextLayer as keyof typeof layerCounts];
        imports.push(
          `src/${nextLayer}/capability-${(index % nextCount) + 1}/index.ts`,
        );
      }
      files[filePath] = {
        kind: 'covered',
        layer,
        module: modulePath,
        imports,
      };
    }
  }
  return {
    schemaVersion: 1,
    architecture: {
      layers: Object.fromEntries(
        Object.keys(layerCounts).map((name) => [
          name,
          {
            paths: [`src/${name}`],
            description: `${name} architecture layer`,
          },
        ]),
      ),
      graphs: [
        {
          name: 'web',
          description: 'Browser application',
          layers: ['routes', 'ui', 'domain'],
          edges: [
            { from: 'routes', to: 'ui' },
            { from: 'ui', to: 'domain' },
          ],
        },
        {
          name: 'api',
          description: 'HTTP application',
          layers: ['controllers', 'services', 'domain'],
          edges: [
            { from: 'controllers', to: 'services' },
            { from: 'services', to: 'domain' },
          ],
        },
        {
          name: 'workers',
          description: 'Background processing',
          layers: ['jobs', 'workflows', 'domain'],
          edges: [
            { from: 'jobs', to: 'workflows' },
            { from: 'workflows', to: 'domain' },
          ],
        },
      ],
      modules: architectureModules,
      moduleRules: [
        { module: 'src/ui/capability-1', canImport: [] },
        {
          module: 'src/domain/capability-1',
          canImport: ['src/domain/capability-7'],
        },
      ],
      ignoredPaths: [],
    },
    files,
    violations: [
      {
        kind: 'module',
        rule: 'canImport',
        from: {
          module: 'src/ui/capability-1',
          layer: 'ui',
          file: 'src/ui/capability-1/index.ts',
        },
        to: {
          module: 'src/ui/capability-5',
          layer: 'ui',
          file: 'src/ui/capability-5/index.ts',
        },
      },
    ],
    coverage: {
      layers: { totalFiles: 60, coveredFiles: 60, uncovered: [] },
      modules: Object.entries(layerCounts).map(([layer, totalFiles]) => ({
        layer,
        totalFiles,
        coveredFiles: totalFiles,
        uncovered: [],
      })),
    },
    warnings: [],
  };
}

export const complexModulesFixtureReport = buildComplexReport();
