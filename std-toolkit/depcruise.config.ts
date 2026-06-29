import {
  feature,
  group,
  layer,
  layersTopDown,
  module,
  type ProjectConfig,
} from 'depcruise-viz';

// ---------------------------------------------------------------------------
// Cross-folder features — one per internal folder (former package).
//
// DAG encoded via barrel visibility / sharedWith:
//   eschema  ← core, dynamodb, sqlite, tanstack-sync  (leaf — imports nothing)
//   core     ← dynamodb, sqlite, tanstack-sync
//   dynamodb, sqlite, tanstack-sync  ← nobody  (leaves toward consumers)
//   dynamodb / sqlite / tanstack-sync  ✗ each other
// ---------------------------------------------------------------------------

const eschemaFeature = feature('eschema', {
  description: 'Schema primitives — DAG leaf, no internal dependencies',
});
const coreFeature = feature('core', {
  description: 'Core broadcaster, schema, and error primitives',
});
const dynamodbFeature = feature('dynamodb', {
  description: 'DynamoDB service and expression layer',
});
const sqliteFeature = feature('sqlite', {
  description: 'SQLite service layer',
});
const tanstackSyncFeature = feature('tanstack-sync', {
  description: 'TanStack Query sync strategies and offline storage',
});

// ---------------------------------------------------------------------------
// Intra-folder layers — rebased from the two preserved per-package configs.
// ---------------------------------------------------------------------------

// --- dynamodb (src/services → src/db/dynamodb/services, etc.) ---
const dynamodbBarrel = layer('dynamodb-barrel', ['src/db/dynamodb/index.ts'], {
  description: 'Public barrel',
});
const dynamodbServices = layer(
  'services',
  ['src/db/dynamodb/services', 'src/db/dynamodb/rpc'],
  { description: 'Entity/command surface and RPC handlers' },
);
const dynamodbExpr = layer('expr', ['src/db/dynamodb/expr'], {
  description: 'Expression builders',
});
const dynamodbInternal = layer('internal', ['src/db/dynamodb/internal'], {
  description: 'Internal DynamoDB implementation details',
});
const dynamodbGenerated = layer('generated', ['src/db/dynamodb/generated'], {
  description: 'Generated code',
});
const dynamodbTypes = layer('types', ['src/db/dynamodb/types'], {
  description: 'DynamoDB type definitions',
});
const dynamodbErrors = layer('errors', ['src/db/dynamodb/errors.ts'], {
  description: 'DynamoDB error types',
});

// --- eschema: barrel over implementation (non-overlapping paths; tests are orphans/warnings) ---
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
  ['src/core/broadcaster.ts', 'src/core/error.ts', 'src/core/schema.ts'],
  { description: 'Internal implementation' },
);

// --- sqlite: barrel over implementation ---
const sqliteBarrel = layer('sqlite-barrel', ['src/db/sqlite/index.ts'], {
  description: 'Public barrel',
});
const sqliteImpl = layer(
  'sqlite-impl',
  [
    'src/db/sqlite/internal',
    'src/db/sqlite/rpc',
    'src/db/sqlite/services',
    'src/db/sqlite/sql',
  ],
  { description: 'Internal implementation' },
);

// --- tanstack-sync (src/... → src/tanstack-sync/...) ---
const syncEntrypoint = layer(
  'entrypoint',
  ['src/tanstack-sync/index.ts', 'src/tanstack-sync/create-std-sync.ts'],
  { description: 'Public API entrypoints' },
);
const syncSync = layer(
  'sync',
  [
    'src/tanstack-sync/partitioned',
    'src/tanstack-sync/single-item',
    'src/tanstack-sync/cadence-sync',
  ],
  { description: 'Sync strategy implementations' },
);
const syncProjection = layer(
  'projection',
  ['src/tanstack-sync/collection-projection'],
  { description: 'Collection view / projector' },
);
const syncInspector = layer('inspector', ['src/tanstack-sync/inspector'], {
  description: 'Devtools inspector collections and row types',
});
const syncPaced = layer('paced', ['src/tanstack-sync/paced'], {
  description: 'Pacing and coalescing infrastructure',
});
const syncRegistry = layer('registry', ['src/tanstack-sync/registry'], {
  description: 'Tracker and registry',
});
const syncSourceOfTruth = layer(
  'source-of-truth',
  ['src/tanstack-sync/source-of-truth'],
  { description: 'Convergence engine and write-error types' },
);
const syncOfflineStorage = layer(
  'offline-storage',
  ['src/tanstack-sync/offline-storage'],
  { description: 'Internal grouped key-value storage and public adapters' },
);
const syncUtil = layer(
  'util',
  ['src/tanstack-sync/util', 'src/tanstack-sync/types.ts'],
  { description: 'Shared types and utility helpers' },
);

// ---------------------------------------------------------------------------
// Stacks — one per intra-folder layering. Grouped below by src bounded context
// (per CONTEXT-MAP.md): core, eschema, db (dynamodb + sqlite), tanstack-sync.
// ---------------------------------------------------------------------------

const eschemaStructure = layersTopDown('eschema-structure', [
  eschemaBarrel,
  eschemaImpl,
]);
const coreStructure = layersTopDown('core-structure', [coreBarrel, coreImpl]);
const sqliteStructure = layersTopDown('sqlite-structure', [
  sqliteBarrel,
  sqliteImpl,
]);
const dynamodbArchitecture = layersTopDown('dynamodb-architecture', [
  dynamodbBarrel,
  dynamodbServices,
  dynamodbExpr,
  dynamodbInternal,
  dynamodbGenerated,
  dynamodbTypes,
  dynamodbErrors,
]);
const tanstackSyncArchitecture = layersTopDown('tanstack-sync-architecture', [
  syncEntrypoint,
  syncSync,
  syncProjection,
  syncInspector,
  syncPaced,
  syncRegistry,
  syncSourceOfTruth,
  syncOfflineStorage,
  syncUtil,
]);

export default {
  rootDir: 'src',
  ignore: [
    '**/__tests__/**',
    'src/*/play.ts',
    'src/eschema/tutorial/**',
    'src/eschema/cli/**',
  ],
  rules: [
    ...group('core', [coreStructure]),
    ...group('eschema', [eschemaStructure]),
    ...group('db', [dynamodbArchitecture, sqliteStructure]),
    ...group('tanstack-sync', [tanstackSyncArchitecture]),
  ],
  features: [
    eschemaFeature,
    coreFeature,
    dynamodbFeature,
    sqliteFeature,
    tanstackSyncFeature,
  ],
  modules: [
    // eschema barrel — accessible to all other folders
    module('src/eschema/index.ts', {
      feature: 'eschema',
      sharedWith: ['core', 'dynamodb', 'sqlite', 'tanstack-sync'],
    }),
    // eschema internals — private to eschema; consumers must go through the barrel
    module('src/eschema/eschema.ts', { feature: 'eschema' }),
    module('src/eschema/internal', { feature: 'eschema' }),
    module('src/eschema/schema.ts', { feature: 'eschema' }),
    module('src/eschema/types.ts', { feature: 'eschema' }),
    module('src/eschema/utils.ts', { feature: 'eschema' }),

    // core barrel — accessible to the three consumer folders
    module('src/core/index.ts', {
      feature: 'core',
      sharedWith: ['dynamodb', 'sqlite', 'tanstack-sync'],
    }),
    // core internals — private to core; consumers must go through the barrel
    module('src/core/broadcaster.ts', { feature: 'core' }),
    module('src/core/error.ts', { feature: 'core' }),
    module('src/core/schema.ts', { feature: 'core' }),

    // dynamodb — not consumed by any sibling folder
    module('src/db/dynamodb/index.ts', { feature: 'dynamodb' }),
    module('src/db/dynamodb/services', { feature: 'dynamodb' }),
    module('src/db/dynamodb/rpc', { feature: 'dynamodb' }),
    module('src/db/dynamodb/expr', { feature: 'dynamodb' }),
    module('src/db/dynamodb/internal', { feature: 'dynamodb' }),
    module('src/db/dynamodb/generated', { feature: 'dynamodb' }),
    module('src/db/dynamodb/types', { feature: 'dynamodb' }),
    module('src/db/dynamodb/errors.ts', { feature: 'dynamodb' }),

    // sqlite — not consumed by any sibling folder
    module('src/db/sqlite/index.ts', { feature: 'sqlite' }),
    module('src/db/sqlite/internal', { feature: 'sqlite' }),
    module('src/db/sqlite/rpc', { feature: 'sqlite' }),
    module('src/db/sqlite/services', { feature: 'sqlite' }),
    module('src/db/sqlite/sql', { feature: 'sqlite' }),

    // tanstack-sync — not consumed by any sibling folder
    module('src/tanstack-sync/index.ts', { feature: 'tanstack-sync' }),
    module('src/tanstack-sync/create-std-sync.ts', {
      feature: 'tanstack-sync',
    }),
    module('src/tanstack-sync/types.ts', { feature: 'tanstack-sync' }),
    module('src/tanstack-sync/partitioned', { feature: 'tanstack-sync' }),
    module('src/tanstack-sync/single-item', { feature: 'tanstack-sync' }),
    module('src/tanstack-sync/cadence-sync', { feature: 'tanstack-sync' }),
    module('src/tanstack-sync/collection-projection', {
      feature: 'tanstack-sync',
    }),
    module('src/tanstack-sync/inspector', { feature: 'tanstack-sync' }),
    module('src/tanstack-sync/paced', { feature: 'tanstack-sync' }),
    module('src/tanstack-sync/registry', { feature: 'tanstack-sync' }),
    module('src/tanstack-sync/source-of-truth', { feature: 'tanstack-sync' }),
    module('src/tanstack-sync/offline-storage', { feature: 'tanstack-sync' }),
    module('src/tanstack-sync/util', { feature: 'tanstack-sync' }),
  ],
} satisfies ProjectConfig;
