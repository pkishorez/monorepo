import { defineConfig, edge, layer, layerGraph, module } from 'laymos';

import { createStdToolkitProjectNarrative } from './project-narrative.js';

const eschemaBarrel = layer('eschema-barrel', ['src/eschema/index.ts'], {
  description: 'Public barrel',
});
const eschemaImpl = layer(
  'eschema-impl',
  [
    'src/eschema/eschema.ts',
    'src/eschema/internal',
    'src/eschema/schema.ts',
    'src/eschema/types.ts',
    'src/eschema/utils.ts',
  ],
  { description: 'Internal implementation' },
);

const coreBarrel = layer('core-barrel', ['src/core/index.ts'], {
  description: 'Public barrel',
});
const coreImpl = layer(
  'core-impl',
  [
    'src/core/broadcaster.ts',
    'src/core/error.ts',
    'src/core/schema.ts',
    'src/core/ulid.ts',
  ],
  { description: 'Internal implementation' },
);

const dynamodbBarrel = layer('dynamodb-barrel', ['src/db/dynamodb/index.ts'], {
  description: 'Public barrel',
});
const dynamodbServicesLayer = layer(
  'dynamodb-services',
  ['src/db/dynamodb/services'],
  { description: 'Entity/command surface' },
);
const dynamodbExpr = layer('dynamodb-expr', ['src/db/dynamodb/expr'], {
  description: 'Expression builders',
});
const dynamodbInternal = layer(
  'dynamodb-internal',
  ['src/db/dynamodb/internal'],
  { description: 'Internal DynamoDB implementation details' },
);
const dynamodbGenerated = layer(
  'dynamodb-generated',
  ['src/db/dynamodb/generated'],
  { description: 'Generated code' },
);
const dynamodbTypes = layer('dynamodb-types', ['src/db/dynamodb/types'], {
  description: 'DynamoDB type definitions',
});
const dynamodbErrors = layer('dynamodb-errors', ['src/db/dynamodb/errors.ts'], {
  description: 'DynamoDB error types',
});

const idbBarrel = layer('idb-barrel', ['src/db/idb/src/index.ts'], {
  description: 'Public barrel',
});
const idbServices = layer(
  'idb-services',
  [
    'src/db/idb/src/idb-entity.ts',
    'src/db/idb/src/idb-single-entity.ts',
    'src/db/idb/src/idb-table.ts',
  ],
  { description: 'Entity and table surface' },
);
const idbBrowser = layer('idb-browser', ['src/db/idb/src/layer.ts'], {
  description: 'Browser IndexedDB implementation and layer wiring',
});
const idbDb = layer('idb-db', ['src/db/idb/src/db.ts'], {
  description: 'Low-level database contract and operation types',
});
const idbInternal = layer('idb-internal', ['src/db/idb/src/internal'], {
  description: 'Internal IndexedDB implementation details',
});
const idbErrors = layer('idb-errors', ['src/db/idb/src/errors.ts'], {
  description: 'IndexedDB error types',
});

const sqliteBarrel = layer('sqlite-barrel', ['src/db/sqlite/index.ts'], {
  description: 'Public barrel',
});
const sqliteServices = layer('sqlite-services', ['src/db/sqlite/services'], {
  description: 'Entity/command surface',
});
const sqliteSql = layer('sqlite-sql', ['src/db/sqlite/sql'], {
  description: 'SQL builders and driver adapters',
});
const sqliteInternal = layer('sqlite-internal', ['src/db/sqlite/internal'], {
  description: 'Internal SQLite implementation details',
});
const sqliteErrors = layer('sqlite-errors', ['src/db/sqlite/errors.ts'], {
  description: 'SQLite error types',
});

const syncEntrypoint = layer(
  'sync-entrypoint',
  ['src/tanstack-sync/index.ts', 'src/tanstack-sync/create-std-sync.ts'],
  { description: 'Public API entrypoints' },
);
const syncPartitioned = layer(
  'sync-partitioned',
  ['src/tanstack-sync/partitioned'],
  { description: 'Partitioned collection sync and shared strategy runtime' },
);
const syncSingleItem = layer(
  'sync-single-item',
  ['src/tanstack-sync/single-item'],
  { description: 'Single-item sync, built on the partitioned runtime' },
);
const syncCadence = layer('sync-cadence', ['src/tanstack-sync/cadence-sync'], {
  description: 'Cadence scheduling shared by both strategies',
});
const syncProjection = layer(
  'sync-projection',
  ['src/tanstack-sync/collection-projection'],
  { description: 'Collection view / projector' },
);
const syncInspector = layer('sync-inspector', ['src/tanstack-sync/inspector'], {
  description: 'Devtools inspector collections and row types',
});
const syncPaced = layer('sync-paced', ['src/tanstack-sync/paced'], {
  description: 'Pacing and coalescing infrastructure',
});
const syncRegistry = layer('sync-registry', ['src/tanstack-sync/registry'], {
  description: 'Tracker and registry',
});
const syncSourceOfTruth = layer(
  'sync-source-of-truth',
  ['src/tanstack-sync/source-of-truth'],
  { description: 'Convergence engine and write-error types' },
);
const syncOfflineStorage = layer(
  'sync-offline-storage',
  ['src/tanstack-sync/offline-storage'],
  { description: 'Internal grouped key-value storage and public adapters' },
);
const syncUtil = layer(
  'sync-util',
  ['src/tanstack-sync/util', 'src/tanstack-sync/types.ts'],
  { description: 'Shared types and utility helpers' },
);

const dynamodbGraph = layerGraph(
  'dynamodb',
  [
    edge(dynamodbBarrel, [
      dynamodbServicesLayer,
      dynamodbExpr,
      dynamodbInternal,
      dynamodbTypes,
      dynamodbErrors,
    ]),
    edge(dynamodbServicesLayer, [
      dynamodbExpr,
      dynamodbInternal,
      dynamodbGenerated,
      dynamodbTypes,
      dynamodbErrors,
      coreBarrel,
    ]),
    edge(dynamodbExpr, [dynamodbInternal, dynamodbTypes]),
    edge(dynamodbInternal, [dynamodbTypes, dynamodbErrors]),
    edge(dynamodbGenerated, dynamodbErrors),
    edge(dynamodbTypes, coreBarrel),
  ],
  {
    description:
      'Typed DynamoDB services, expressions, generated metadata, and internal storage support',
  },
);

const dynamodbServicesModule = module('src/db/dynamodb/services', {
  description:
    'Public entity, singleton, table, and client services for DynamoDB',
});

export default defineConfig({
  sourceRoots: ['src'],
  ignore: [
    'src/core/__tests__',
    'src/db/__tests__',
    'src/db/dynamodb/__tests__',
    'src/db/dynamodb/expr/__tests__',
    'src/db/dynamodb/play',
    'src/db/idb/__tests__',
    'src/db/sqlite/__tests__',
    'src/db/sqlite/services/__tests__',
    'src/db/sqlite/sql/adapters/__tests__',
    'src/db/sqlite/play.ts',
    'src/eschema/__tests__',
    'src/eschema/cli',
    'src/eschema/play.ts',
    'src/eschema/tutorial',
    'src/tanstack-sync/__tests__',
    'src/tanstack-sync/cadence-sync/__tests__',
    'src/tanstack-sync/offline-storage/__tests__',
    'src/tanstack-sync/partitioned/__tests__',
    'src/tanstack-sync/partitioned/strategies/bidirectional/__tests__',
    'src/tanstack-sync/partitioned/strategies/new-to-old/__tests__',
    'src/tanstack-sync/source-of-truth/__tests__',
  ],
  graphs: [
    layerGraph('eschema', [edge(eschemaBarrel, eschemaImpl)], {
      description: 'Schema entrypoint and implementation',
    }),
    layerGraph(
      'core',
      [edge(coreBarrel, coreImpl), edge(coreImpl, eschemaBarrel)],
      { description: 'Core utilities and their schema dependency' },
    ),
    dynamodbGraph,
    layerGraph(
      'idb',
      [
        edge(idbBarrel, [idbServices, idbBrowser]),
        edge(idbServices, [idbDb, idbInternal, coreBarrel]),
        edge(idbBrowser, idbDb),
        edge(idbDb, idbErrors),
        edge(idbInternal, coreBarrel),
        edge(idbErrors, coreBarrel),
      ],
      {
        description:
          'IndexedDB services, browser wiring, and storage internals',
      },
    ),
    layerGraph(
      'sqlite',
      [
        edge(sqliteBarrel, [sqliteServices, sqliteSql, sqliteErrors]),
        edge(sqliteServices, [sqliteInternal, sqliteSql, coreBarrel]),
        edge(sqliteInternal, coreBarrel),
        edge(sqliteSql, [sqliteErrors, coreBarrel]),
      ],
      {
        description: 'SQLite services, SQL adapters, and storage internals',
      },
    ),
    layerGraph(
      'tanstack-sync',
      [
        edge(syncEntrypoint, [
          syncSingleItem,
          syncPartitioned,
          syncCadence,
          syncInspector,
          syncOfflineStorage,
          syncPaced,
          syncRegistry,
          syncUtil,
          coreBarrel,
        ]),
        edge(syncSingleItem, [
          syncPartitioned,
          syncProjection,
          syncInspector,
          syncPaced,
          syncRegistry,
          syncSourceOfTruth,
          syncOfflineStorage,
          syncUtil,
          coreBarrel,
        ]),
        edge(syncPartitioned, [
          syncCadence,
          syncProjection,
          syncInspector,
          syncPaced,
          syncRegistry,
          syncSourceOfTruth,
          syncOfflineStorage,
          syncUtil,
          coreBarrel,
        ]),
        edge(syncCadence, [syncSourceOfTruth, syncUtil, coreBarrel]),
        edge(syncProjection, [syncSourceOfTruth, syncUtil, coreBarrel]),
        edge(syncRegistry, [syncSourceOfTruth, coreBarrel]),
        edge(syncInspector, [syncOfflineStorage, syncUtil]),
        edge(syncSourceOfTruth, [syncOfflineStorage, coreBarrel]),
        edge(syncUtil, coreBarrel),
      ],
      {
        description:
          'TanStack sync entrypoints, strategies, convergence, and persistence',
      },
    ),
  ],
  modules: [
    module('src/eschema/index.ts', {
      description: 'Public schema API',
    }),
    module('src/eschema/eschema.ts', {
      description: 'Entity schema construction and evolution',
    }),
    module('src/eschema/internal', {
      description: 'Internal schema helpers',
    }),
    module('src/eschema/schema.ts', {
      description: 'Schema declarations',
    }),
    module('src/eschema/types.ts', {
      description: 'Schema type definitions',
    }),
    module('src/eschema/utils.ts', {
      description: 'Schema utilities',
    }),

    module('src/core/index.ts', {
      description: 'Public core API',
    }),
    module('src/core/broadcaster.ts', {
      description: 'Change broadcasting',
    }),
    module('src/core/error.ts', {
      description: 'Shared error definitions',
    }),
    module('src/core/schema.ts', {
      description: 'Shared schema helpers',
    }),
    module('src/core/ulid.ts', {
      description: 'Monotonic identifier generation',
    }),

    module('src/db/dynamodb/index.ts', {
      description: 'Public DynamoDB API',
    }),
    dynamodbServicesModule,
    module('src/db/dynamodb/expr', {
      description: 'DynamoDB expression builders',
    }),
    module('src/db/dynamodb/internal', {
      description: 'Internal DynamoDB implementation',
    }),
    module('src/db/dynamodb/generated', {
      description: 'Generated DynamoDB metadata',
    }),
    module('src/db/dynamodb/types', {
      description: 'DynamoDB type contracts',
    }),
    module('src/db/dynamodb/errors.ts', {
      description: 'DynamoDB errors',
    }),

    module('src/db/idb/src/index.ts', {
      description: 'Public IndexedDB API',
    }),
    module('src/db/idb/src/idb-entity.ts', {
      description: 'IndexedDB entity collections',
    }),
    module('src/db/idb/src/idb-single-entity.ts', {
      description: 'IndexedDB singleton entities',
    }),
    module('src/db/idb/src/idb-table.ts', {
      description: 'IndexedDB table services',
    }),
    module('src/db/idb/src/layer.ts', {
      description: 'IndexedDB Effect layer',
    }),
    module('src/db/idb/src/db.ts', {
      description: 'IndexedDB database contract',
    }),
    module('src/db/idb/src/internal', {
      description: 'Internal IndexedDB implementation',
    }),
    module('src/db/idb/src/errors.ts', {
      description: 'IndexedDB errors',
    }),

    module('src/db/sqlite/index.ts', {
      description: 'Public SQLite API',
    }),
    module('src/db/sqlite/errors.ts', {
      description: 'SQLite errors',
    }),
    module('src/db/sqlite/internal', {
      description: 'Internal SQLite implementation',
    }),
    module('src/db/sqlite/services', {
      description: 'SQLite entity and singleton services',
    }),
    module('src/db/sqlite/sql', {
      description: 'SQL builders and adapters',
    }),

    module('src/tanstack-sync/index.ts', {
      description: 'Public TanStack sync API',
    }),
    module('src/tanstack-sync/create-std-sync.ts', {
      description: 'TanStack sync construction',
    }),
    module('src/tanstack-sync/types.ts', {
      description: 'Shared TanStack sync types',
    }),
    module('src/tanstack-sync/partitioned', {
      description: 'Partitioned collection synchronization',
    }),
    module('src/tanstack-sync/single-item', {
      description: 'Single-item synchronization',
    }),
    module('src/tanstack-sync/cadence-sync', {
      description: 'Sync cadence scheduling',
    }),
    module('src/tanstack-sync/collection-projection', {
      description: 'Synchronized collection projections',
    }),
    module('src/tanstack-sync/inspector', {
      description: 'Sync inspection data',
    }),
    module('src/tanstack-sync/paced', {
      description: 'Paced synchronization',
    }),
    module('src/tanstack-sync/registry', {
      description: 'Sync tracker registry',
    }),
    module('src/tanstack-sync/source-of-truth', {
      description: 'Source-of-truth convergence',
    }),
    module('src/tanstack-sync/offline-storage', {
      description: 'Offline synchronization storage',
    }),
    module('src/tanstack-sync/util', {
      description: 'Shared synchronization utilities',
    }),
  ],
  project: createStdToolkitProjectNarrative(),
});
