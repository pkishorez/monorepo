import {
  feature,
  layer,
  layersTopDown,
  module,
  type ProjectConfig,
} from 'dependency-cruiser-viz';

const entrypoint = layer(
  'entrypoint',
  ['src/index.ts', 'src/create-std-sync.ts'],
  {
    description: 'Public API entrypoints',
  },
);
const sync = layer('sync', ['src/partitioned', 'src/single-item'], {
  description: 'Sync strategy implementations',
});
const projection = layer('projection', ['src/collection-projection'], {
  description: 'Collection view / projector',
});
const paced = layer('paced', ['src/paced'], {
  description: 'Pacing and coalescing infrastructure',
});
const registry = layer('registry', ['src/registry'], {
  description: 'Tracker and registry',
});
const sourceOfTruth = layer('source-of-truth', ['src/source-of-truth'], {
  description: 'Convergence engine and write-error types',
});
const offlineStorage = layer('offline-storage', ['src/offline-storage'], {
  description: 'Internal grouped key-value storage and public adapters',
});
const util = layer('util', ['src/util', 'src/types.ts'], {
  description: 'Shared types and utility helpers',
});

const api = feature('api', {
  description: 'Public API surface — factory and barrel exports',
});
const partitioned = feature('partitioned', {
  description: 'Partitioned collection sync',
});
const singleItem = feature('single-item', { description: 'Single-item sync' });

export default {
  rootDir: 'src',
  rules: [
    layersTopDown('production', [
      entrypoint,
      sync,
      projection,
      paced,
      registry,
      sourceOfTruth,
      offlineStorage,
      util,
    ]),
  ],
  features: [api, partitioned, singleItem],
  modules: [
    module('src/partitioned', {
      feature: 'partitioned',
      visibility: 'shared',
      sharedWith: ['single-item', 'api'],
    }),
    module('src/single-item', {
      feature: 'single-item',
      visibility: 'shared',
      sharedWith: ['api'],
    }),
    module('src/index.ts', { feature: 'api' }),
    module('src/create-std-sync.ts', { feature: 'api' }),
    module('src/types.ts'),
    module('src/collection-projection'),
    module('src/paced'),
    module('src/registry'),
    module('src/source-of-truth'),
    module('src/offline-storage'),
    module('src/util'),
  ],
} satisfies ProjectConfig;
