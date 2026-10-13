import type { ArchitectureAnalysis } from 'laymos';

/**
 * The shop fixture of laymos (src/tests/fixtures/tree/shop), as
 * `laymos inspect project --json` reports it.
 */
export const shopAnalysis: ArchitectureAnalysis = {
  config: {
    sourceRoots: ['src', 'scripts'],
    ignoredPaths: ['src/domain/orders/generated.ts'],
    fileModules: ['src/core/ids.ts'],
    rules: {
      'src/app': ['src/domain'],
      '*': ['src/core'],
    },
    exceptions: [
      {
        from: 'src/infra',
        to: 'src',
        because:
          'infra boots the app through its door until the composition root moves out',
      },
    ],
  },
  tree: {
    root: '.',
    nodes: [
      {
        path: '.',
        kind: 'wrapper',
        shape: 'folder',
        ownFiles: [],
        children: ['scripts', 'src'],
      },
      {
        path: 'scripts',
        kind: 'wrapper',
        shape: 'folder',
        ownFiles: ['scripts/seed.ts'],
        parent: '.',
        children: [],
      },
      {
        path: 'src',
        kind: 'module',
        shape: 'folder',
        index: 'src/index.ts',
        ownFiles: ['src/domain/pricing.ts', 'src/index.ts'],
        parent: '.',
        children: ['src/app', 'src/core', 'src/domain', 'src/infra'],
      },
      {
        path: 'src/app',
        kind: 'module',
        shape: 'folder',
        index: 'src/app/index.ts',
        ownFiles: ['src/app/index.ts'],
        parent: 'src',
        children: [],
      },
      {
        path: 'src/core',
        kind: 'wrapper',
        shape: 'folder',
        ownFiles: [],
        parent: 'src',
        children: ['src/core/ids.ts'],
      },
      {
        path: 'src/core/ids.ts',
        kind: 'module',
        shape: 'file',
        index: 'src/core/ids.ts',
        ownFiles: ['src/core/ids.ts'],
        parent: 'src/core',
        children: [],
      },
      {
        path: 'src/domain',
        kind: 'wrapper',
        shape: 'folder',
        ownFiles: [],
        parent: 'src',
        children: ['src/domain/orders'],
      },
      {
        path: 'src/domain/orders',
        kind: 'module',
        shape: 'folder',
        index: 'src/domain/orders/index.ts',
        ownFiles: [
          'src/domain/orders/index.ts',
          'src/domain/orders/internal.ts',
          'src/domain/orders/order.ts',
        ],
        parent: 'src/domain',
        children: [],
      },
      {
        path: 'src/infra',
        kind: 'module',
        shape: 'folder',
        index: 'src/infra/index.ts',
        ownFiles: ['src/infra/index.ts'],
        parent: 'src',
        children: [],
      },
    ],
    owners: {
      'scripts/seed.ts': 'scripts',
      'src/app/index.ts': 'src/app',
      'src/core/ids.ts': 'src/core/ids.ts',
      'src/domain/orders/index.ts': 'src/domain/orders',
      'src/domain/orders/internal.ts': 'src/domain/orders',
      'src/domain/orders/order.ts': 'src/domain/orders',
      'src/domain/pricing.ts': 'src',
      'src/index.ts': 'src',
      'src/infra/index.ts': 'src/infra',
    },
  },
  imports: [
    {
      fromFile: 'src/app/index.ts',
      fromModule: 'src/app',
      toFile: 'src/domain/orders/index.ts',
      toModule: 'src/domain/orders',
      verdict: {
        kind: 'rule',
        rule: {
          from: 'src/app',
          to: 'src/domain',
        },
      },
    },
    {
      fromFile: 'src/app/index.ts',
      fromModule: 'src/app',
      toFile: 'src/domain/orders/internal.ts',
      toModule: 'src/domain/orders',
      verdict: {
        kind: 'violation',
        reason: 'not-index',
        remedy: 'none',
      },
    },
    {
      fromFile: 'src/app/index.ts',
      fromModule: 'src/app',
      toFile: 'src/infra/index.ts',
      toModule: 'src/infra',
      verdict: {
        kind: 'violation',
        reason: 'no-rule',
        remedy: 'rule',
      },
    },
    {
      fromFile: 'src/domain/orders/order.ts',
      fromModule: 'src/domain/orders',
      toFile: 'src/core/ids.ts',
      toModule: 'src/core/ids.ts',
      verdict: {
        kind: 'rule',
        rule: {
          from: 'src/domain',
          to: 'src/core',
        },
      },
    },
    {
      fromFile: 'src/index.ts',
      fromModule: 'src',
      toFile: 'src/app/index.ts',
      toModule: 'src/app',
      verdict: {
        kind: 'nested',
      },
    },
    {
      fromFile: 'src/infra/index.ts',
      fromModule: 'src/infra',
      toFile: 'src/index.ts',
      toModule: 'src',
      verdict: {
        kind: 'exception',
        exception: {
          from: 'src/infra',
          to: 'src',
          because:
            'infra boots the app through its door until the composition root moves out',
        },
      },
    },
  ],
  findings: [
    {
      kind: 'wrapper-coverage',
      file: 'scripts/seed.ts',
    },
    {
      kind: 'unused-rule',
      rule: {
        from: 'src/app',
        to: 'src/core',
      },
    },
    {
      kind: 'unused-rule',
      rule: {
        from: 'src/infra',
        to: 'src/core',
      },
    },
  ],
};
