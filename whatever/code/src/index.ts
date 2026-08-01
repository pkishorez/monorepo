import { Layer } from 'effect';
import { WhateverHandlersLive } from './handlers/index.js';
import { makeDbLayer } from './services/index.js';

export {
  DEFAULT_DB_PATH,
  DEFAULT_TABLE_NAME,
  type DbOptions,
} from './services/index.js';

export const makeWhateverHandlers = (options: { dbPath?: string } = {}) =>
  WhateverHandlersLive.pipe(Layer.provideMerge(makeDbLayer(options)));
