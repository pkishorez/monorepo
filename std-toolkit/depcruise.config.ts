import {
  edge,
  layer,
  layerGraph,
  module,
  type ProjectConfig,
} from 'depcruise-viz';

// ---------------------------------------------------------------------------
// One layer graph per internal folder (former package); the shared
// `core-barrel` / `eschema-barrel` layers merge by name across graphs.
//
// Cross-folder DAG:
//   eschema  ← core, dynamodb, idb, sqlite, tanstack-sync  (leaf — imports nothing)
//   core     ← dynamodb, idb, sqlite, tanstack-sync
//   dynamodb / idb / sqlite / tanstack-sync — siblings, forbidden from each other
//
// core-barrel reaches eschema-barrel (via core-impl), so any layer with a
// path to core-barrel may also import eschema — no direct eschema edges
// needed from the consumer folders.
// ---------------------------------------------------------------------------

// --- eschema: barrel over implementation ---
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

// --- core: barrel over implementation ---
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

// --- dynamodb ---
const dynamodbBarrel = layer('dynamodb-barrel', ['src/db/dynamodb/index.ts'], {
  description: 'Public barrel',
});
const dynamodbServices = layer(
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

// --- idb ---
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

// --- sqlite ---
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

// --- tanstack-sync ---
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

export default {
  rootDir: 'src',
  // ignore entries are literal path prefixes, not globs
  ignore: [
    'src/core/__tests__',
    'src/db/__tests__',
    'src/db/dynamodb/__tests__',
    'src/db/dynamodb/expr/__tests__',
    'src/db/dynamodb/play',
    'src/db/idb/__tests__',
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
  rules: [
    layerGraph('eschema', [edge(eschemaBarrel, eschemaImpl)]),

    layerGraph('core', [
      edge(coreBarrel, coreImpl),
      edge(coreImpl, eschemaBarrel),
    ]),

    // Edges mirror the measured imports 1:1 — no chain-only shortcuts.
    // Sibling pairs (no edge, forbidden both ways): expr ✗ generated,
    // internal ✗ generated, types ✗ errors, expr ✗ errors.
    layerGraph('dynamodb', [
      edge(dynamodbBarrel, [
        dynamodbServices,
        dynamodbExpr,
        dynamodbInternal,
        dynamodbTypes,
        dynamodbErrors,
      ]),
      edge(dynamodbServices, [
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
    ]),

    // browser and services are siblings; both depend on the low-level DB
    // contract, while only services use key derivation internals.
    layerGraph('idb', [
      edge(idbBarrel, [idbServices, idbBrowser]),
      edge(idbServices, [idbDb, idbInternal, coreBarrel]),
      edge(idbBrowser, idbDb),
      edge(idbDb, idbErrors),
      edge(idbInternal, coreBarrel),
      edge(idbErrors, coreBarrel),
    ]),

    // Siblings: internal ✗ sql, internal ✗ errors, services ✗ errors —
    // only sql may touch the error types.
    layerGraph('sqlite', [
      edge(sqliteBarrel, [sqliteServices, sqliteSql, sqliteErrors]),
      edge(sqliteServices, [sqliteInternal, sqliteSql, coreBarrel]),
      edge(sqliteInternal, coreBarrel),
      edge(sqliteSql, [sqliteErrors, coreBarrel]),
    ]),

    // single-item builds on the partitioned runtime (tracker, sync-state,
    // strategy interface); both lean on cadence-sync, which imports neither.
    // projection/inspector/paced/registry are siblings of one another;
    // projection + registry converge on the source-of-truth engine, which
    // persists via offline-storage.
    layerGraph('tanstack-sync', [
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
    ]),
  ],
  modules: [
    // eschema
    module('src/eschema/index.ts'),
    module('src/eschema/eschema.ts'),
    module('src/eschema/internal'),
    module('src/eschema/schema.ts'),
    module('src/eschema/types.ts'),
    module('src/eschema/utils.ts'),

    // core
    module('src/core/index.ts'),
    module('src/core/broadcaster.ts'),
    module('src/core/error.ts'),
    module('src/core/schema.ts'),
    module('src/core/ulid.ts'),

    // dynamodb
    module('src/db/dynamodb/index.ts'),
    module('src/db/dynamodb/services'),
    module('src/db/dynamodb/expr'),
    module('src/db/dynamodb/internal'),
    module('src/db/dynamodb/generated'),
    module('src/db/dynamodb/types'),
    module('src/db/dynamodb/errors.ts'),

    // idb
    module('src/db/idb/src/index.ts'),
    module('src/db/idb/src/idb-entity.ts'),
    module('src/db/idb/src/idb-single-entity.ts'),
    module('src/db/idb/src/idb-table.ts'),
    module('src/db/idb/src/layer.ts'),
    module('src/db/idb/src/db.ts'),
    module('src/db/idb/src/internal'),
    module('src/db/idb/src/errors.ts'),

    // sqlite
    module('src/db/sqlite/index.ts'),
    module('src/db/sqlite/errors.ts'),
    module('src/db/sqlite/internal'),
    module('src/db/sqlite/services'),
    module('src/db/sqlite/sql'),

    // tanstack-sync
    module('src/tanstack-sync/index.ts'),
    module('src/tanstack-sync/create-std-sync.ts'),
    module('src/tanstack-sync/types.ts'),
    module('src/tanstack-sync/partitioned'),
    module('src/tanstack-sync/single-item'),
    module('src/tanstack-sync/cadence-sync'),
    module('src/tanstack-sync/collection-projection'),
    module('src/tanstack-sync/inspector'),
    module('src/tanstack-sync/paced'),
    module('src/tanstack-sync/registry'),
    module('src/tanstack-sync/source-of-truth'),
    module('src/tanstack-sync/offline-storage'),
    module('src/tanstack-sync/util'),
  ],
} satisfies ProjectConfig;
