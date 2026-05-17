import { HttpApiBuilder } from '@effect/platform';
import { Layer } from 'effect';
import { LotelApi } from '../http-api/index.js';
import { LotelHandlersLive } from './handlers.js';

export const LotelApiLive = HttpApiBuilder.api(LotelApi).pipe(
  Layer.provide(LotelHandlersLive),
);
