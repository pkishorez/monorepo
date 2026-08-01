import { Layer } from 'effect';
import { WhateverHandlersLive } from './handlers/index.js';
import { makeDbLayer } from './services/db/index.js';
import { gitLayer } from './services/git/index.js';
import { harnessLayer } from './services/harness/index.js';

export {
  DEFAULT_DB_PATH,
  DEFAULT_TABLE_NAME,
  type DbOptions,
} from './services/db/index.js';

export const makeWhateverHandlers = (options: { dbPath?: string } = {}) =>
  WhateverHandlersLive.pipe(
    Layer.provideMerge(
      Layer.mergeAll(makeDbLayer(options), gitLayer, harnessLayer),
    ),
  );
