import { RpcSerialization } from '@effect/rpc';
import { executeRpc } from '@kishorez/effect-cf/websocket/server.js';
import { Duration, Effect, Layer } from 'effect';
import { TodosRpc } from './backend/domain';
import { BroadcastService } from '@std-toolkit/core/broadcast.js';
import { ObservabilityLayer } from './common/observability';
import { TodosRpcLive } from './backend/dynamo/api';

executeRpc(
  TodosRpc,
  '{"_tag":"Request","id":"0","tag":"subscribeQuery","traceId":"d79372644cda8415d1d7a007280663de","payload":{},"spanId":"e13c6558d22789ee","sampled":true,"headers":[]}\n',
  (response) => console.log('sending message...', response),
).pipe(
  Effect.provide(
    TodosRpcLive.pipe(
      Layer.merge(RpcSerialization.layerNdjson),
      Layer.provide(
        Layer.mergeAll(
          Layer.succeed(
            BroadcastService,
            BroadcastService.of({
              onBroadcast: (value) => {
                console.log('Broadcasting value: ', value);
              },
            }),
          ),
          ObservabilityLayer,
        ),
      ),
    ),
  ),
);

Duration.greaterThan(Duration.hours(1), Duration.minutes(30));
