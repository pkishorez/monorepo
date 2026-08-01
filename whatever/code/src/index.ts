import { Layer } from 'effect';
import { CodeHandlersLive } from './handlers/index.js';
import { makeDbLayer } from './services/index.js';

export { DEFAULT_DB_PATH } from './services/index.js';

export const makeCodeHandlers = (options: { dbPath?: string } = {}) =>
  CodeHandlersLive.pipe(Layer.provideMerge(makeDbLayer(options)));
