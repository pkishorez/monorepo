import { Effect } from 'effect';
import type { Layer, LayerRule } from '../../layers/model';
import type {
  Module,
  ModuleDependency,
  ModuleGraph,
  ModuleViolation,
} from '../model';

export { layerGraphs as moduleLayerGraphs } from '../../layers/fixtures/fixture-data';

export const loadFixtureModuleSource = (modulePath: string) =>
  Effect.succeed({
    modulePath,
    entryPoint: `${modulePath}/index.ts`,
    files: [
      {
        path: `${modulePath}/index.ts`,
        content: `export const modulePath = '${modulePath}';\n`,
      },
      {
        path: `${modulePath}/internal.ts`,
        content: 'export const internal = true;\n',
      },
      ...(modulePath === 'src/domain/orders/pricing'
        ? [
            {
              path: `${modulePath}/round.ts`,
              content: 'export const round = true;\n',
            },
            {
              path: `${modulePath}/tax.ts`,
              content: 'export const tax = true;\n',
            },
          ]
        : []),
    ],
  });

export const moduleLayers: readonly Layer[] = [
  {
    id: 'presentation',
    description: 'Routes and screens that start user-facing workflows.',
    scopes: [
      { path: 'src/web/routes', fileCount: 3 },
      { path: 'src/web/screens', fileCount: 3 },
    ],
  },
  {
    id: 'application',
    description: 'Coordinates application use cases.',
    scopes: [{ path: 'src/application', fileCount: 13 }],
  },
  {
    id: 'infrastructure',
    description: 'Implements external adapters.',
    scopes: [{ path: 'src/adapters', fileCount: 8 }],
  },
  {
    id: 'domain',
    description: 'Contains business rules and domain values.',
    scopes: [{ path: 'src/domain', fileCount: 12 }],
  },
  {
    id: 'foundation',
    description: 'Provides stable primitives.',
    scopes: [{ path: 'src/shared', fileCount: 4 }],
  },
];

export const moduleRules: readonly LayerRule[] = [
  {
    fromLayerId: 'presentation',
    toLayerIds: ['application', 'domain'],
  },
  {
    fromLayerId: 'application',
    toLayerIds: ['domain', 'infrastructure'],
  },
  {
    fromLayerId: 'infrastructure',
    toLayerIds: ['domain', 'foundation'],
  },
  { fromLayerId: 'domain', toLayerIds: ['foundation'] },
];

export const modules: readonly Module[] = [
  module('src/web/routes', 'presentation', 'root', { exposed: false }),
  module('src/web/screens', 'presentation', 'root', { exposed: false }),
  module('src/application/orders', 'application', 'regular'),
  module('src/application/accounts', 'application', 'regular'),
  module('src/application/shared', 'application', 'regular', { shared: true }),
  module('src/application/cache', 'application', 'regular', { shared: true }),
  module('src/application/unused-shared', 'application', 'root', {
    shared: true,
  }),
  module('src/domain/orders/index.ts', 'domain', 'regular', {
    graphId: 'orders',
    member: 'index.ts',
    exposed: true,
  }),
  module('src/domain/orders/pricing', 'domain', 'regular', {
    graphId: 'orders',
    member: 'pricing',
  }),
  module('src/domain/orders/events', 'domain', 'terminal', {
    graphId: 'orders',
    member: 'events',
  }),
  module('src/domain/orders/tax-table', 'domain', 'isolated', {
    graphId: 'orders',
    member: 'tax-table',
  }),
  module('src/domain/users', 'domain', 'terminal'),
  module('src/domain/common', 'domain', 'isolated', { shared: true }),
  module('src/adapters/database', 'infrastructure', 'regular'),
  module('src/adapters/http', 'infrastructure', 'root'),
  module('src/adapters/queue', 'infrastructure', 'isolated'),
  module('src/shared/errors', 'foundation', 'terminal', { shared: true }),
  module('src/shared/types', 'foundation', 'terminal', { shared: true }),
];

export const moduleGraphs: readonly ModuleGraph[] = [
  {
    id: 'orders',
    layerId: 'domain',
    path: 'src/domain/orders',
    description: 'Prices an order and emits what changed.',
    memberIds: [
      'src/domain/orders/index.ts',
      'src/domain/orders/pricing',
      'src/domain/orders/events',
      'src/domain/orders/tax-table',
    ],
    rules: [
      {
        fromModuleId: 'src/domain/orders/index.ts',
        toModuleId: 'src/domain/orders/pricing',
      },
      {
        fromModuleId: 'src/domain/orders/pricing',
        toModuleId: 'src/domain/orders/events',
      },
    ],
  },
];

export const moduleDependencies: readonly ModuleDependency[] = [
  dependency('src/web/routes', 'src/application/orders'),
  dependency('src/web/screens', 'src/application/accounts'),
  dependency('src/application/orders', 'src/domain/orders/index.ts'),
  dependency('src/application/orders', 'src/adapters/database'),
  dependency('src/application/orders', 'src/application/shared'),
  dependency('src/application/accounts', 'src/domain/users'),
  dependency('src/application/shared', 'src/application/cache'),
  dependency('src/application/cache', 'src/application/shared'),
  dependency('src/application/unused-shared', 'src/shared/types'),
  dependency('src/domain/orders/pricing', 'src/shared/types'),
  dependency('src/adapters/database', 'src/domain/orders/index.ts'),
  dependency('src/adapters/http', 'src/shared/errors'),
];

export const moduleViolations: readonly ModuleViolation[] = [
  {
    id: 'accounts-to-orders',
    kind: 'dependency',
    fromModuleId: 'src/application/accounts',
    toModuleId: 'src/application/orders',
    fromFile: 'src/application/accounts/update-account.ts',
    toFile: 'src/application/orders/create-order.ts',
  },
  {
    id: 'routes-to-orders-internal',
    kind: 'boundary',
    fromModuleId: 'src/web/routes',
    toModuleId: 'src/domain/orders/index.ts',
    fromFile: 'src/web/routes/orders-route.ts',
    toFile: 'src/domain/orders/order.ts',
  },
  {
    id: 'application-cycle',
    kind: 'cycle',
    moduleIds: ['src/application/shared', 'src/application/cache'],
  },
  {
    id: 'missing-pricing-entry-point',
    kind: 'missing-entry-point',
    moduleId: 'src/domain/orders/pricing',
    path: 'src/domain/orders/pricing/index.ts',
  },
  {
    id: 'orders-graph-loose-file',
    kind: 'graph-coverage',
    graphId: 'orders',
    layerId: 'domain',
    file: 'src/domain/orders/legacy-rounding.ts',
  },
  {
    id: 'dead-orders-tax-table',
    kind: 'dead-module',
    moduleId: 'src/domain/orders/tax-table',
  },
  {
    id: 'unassigned-domain-file',
    kind: 'coverage',
    layerId: 'domain',
    file: 'src/domain/legacy-tax.ts',
  },
];

function module(
  id: string,
  layerId: string,
  kind: Module['kind'],
  options: {
    readonly shared?: boolean;
    readonly exposed?: boolean;
    readonly graphId?: string;
    readonly member?: string;
  } = {},
): Module {
  return {
    id,
    layerId,
    kind,
    shared: options.shared ?? false,
    exposed: options.exposed ?? !(options.graphId !== undefined),
    ...(options.graphId === undefined ? {} : { graphId: options.graphId }),
    ...(options.member === undefined ? {} : { member: options.member }),
  };
}

function dependency(
  fromModuleId: string,
  toModuleId: string,
  toEntryPointId = toModuleId,
): ModuleDependency {
  return { fromModuleId, toModuleId, toEntryPointId, permitted: true };
}
