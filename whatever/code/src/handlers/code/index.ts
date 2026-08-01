import { Layer } from 'effect';
import { InterruptRunHandlerLive } from './interrupt-run.js';
import { StartRunHandlerLive } from './start-run.js';
import { StartThreadHandlerLive } from './start-thread.js';

export const CodeHandlersLive = Layer.mergeAll(
  StartThreadHandlerLive,
  StartRunHandlerLive,
  InterruptRunHandlerLive,
);
