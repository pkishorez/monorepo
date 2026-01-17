import { Effect, Layer, ManagedRuntime, Scope } from 'effect';
import { ApiService } from './api';
import { WebSocketService } from './websocket';
import { ObservabilityLayer } from '@/common/observability';

const scope = Effect.runSync(Scope.make());
export const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    ApiService.Default,
    WebSocketService.Default,
    ObservabilityLayer,
  ),
);
