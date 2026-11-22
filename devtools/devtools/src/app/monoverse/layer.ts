import { Layer } from 'effect';

import { monoverseClient } from './client/index.js';
import { monorepoLayer } from './services/monorepo/index.js';

/**
 * What Monoverse's tree Requires, talking to the DevTools Server at
 * `origin`: the server's client, and the Monorepo service on it.
 */
export const monoverseLayer = (origin: string) =>
  monorepoLayer.pipe(Layer.provideMerge(monoverseClient(origin)));
