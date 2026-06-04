import { Layer } from 'effect';
import { HttpApiBuilder } from 'effect/unstable/httpapi';
import { LotelApi } from '../http-api/index.js';
import { LotelHandlersLive } from './handlers.js';

export const LotelApiLive = HttpApiBuilder.layer(LotelApi).pipe(
  Layer.provide(LotelHandlersLive),
);
