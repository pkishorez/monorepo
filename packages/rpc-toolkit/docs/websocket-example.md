# Cannotation over hibernating WebSocket RPC

Keep the contract, server implementation, and browser implementation in separate
files. The application supplies its token verifier; this example does not treat
client-supplied identity or roles as trusted authorization.

```ts
// contract.ts — imported by the server and browser
import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { Cannotation } from 'rpc-toolkit/rpc/cannotation';

export class Forbidden extends Schema.Error<Forbidden>('example/Forbidden')({
  _tag: Schema.tag('Forbidden'),
}) {}

export const Access = Cannotation.make<boolean>()('example/Access', {
  error: Forbidden,
  client: true,
});

export const Counter = Access.with(true)(
  RpcGroup.make(Rpc.make('watch', { success: Schema.Number, stream: true })),
);
```

```ts
// server.ts — server only
import { Effect, Layer, Option, Schema, Stream } from 'effect';
import { InvocationKind } from 'rpc-toolkit/rpc/invocation';
import { StreamCheckpoint } from 'rpc-toolkit/rpc/cloudflare/hibernating-rpc';
import { Access, Counter, Forbidden } from './contract.js';

export const makeHandlers = (options: {
  authorize: (token: string | undefined) => Effect.Effect<void, Forbidden>;
  checkRateLimit: (token: string | undefined) => Effect.Effect<void, Forbidden>;
}) =>
  Layer.merge(
    Access.layer(({ headers }) =>
      Effect.gen(function* () {
        // Revalidate on both fresh calls and replay. Do not cache permissions here.
        yield* options.authorize(headers.authorization);
        if ((yield* InvocationKind) === 'fresh') {
          yield* options.checkRateLimit(headers.authorization);
        }
      }),
    ),
    Counter.toLayer({
      watch: () =>
        Stream.unwrap(
          Effect.gen(function* () {
            const checkpoint = yield* StreamCheckpoint(Schema.Number);
            let cursor = Option.getOrElse(
              yield* checkpoint.get().pipe(Effect.orDie),
              () => 0,
            );
            return Stream.repeatEffect(
              Effect.gen(function* () {
                yield* Effect.sleep('1 second');
                yield* checkpoint.put(++cursor).pipe(Effect.orDie);
                return cursor;
              }),
            );
          }),
        ),
    }),
  );
```

With Alchemy, declare the Worker and its Durable Object together. Here,
`authorization.ts` is your server-only implementation of the `authorize` and
`checkRateLimit` callbacks accepted by `makeHandlers` above.

```ts
// counter-worker.ts — default export required by Alchemy
import { Effect } from 'effect';
import { DurableRpcWorker } from 'rpc-toolkit/rpc/cloudflare/alchemy/durable-rpc-worker';
import { Counter } from './contract.js';
import { makeHandlers } from './server.js';
import { authorization } from './authorization.js';

export default class CounterWorker extends DurableRpcWorker<CounterWorker>()(
  'CounterWorker',
  {
    main: import.meta.filename,
    schema: Counter,
    objectName: 'CounterObject',
    instanceName: 'singleton',
    workersDev: true,
    compatibility: { flags: ['nodejs_compat'] },
  },
  Effect.sync(() => makeHandlers(authorization)),
) {}
```

`DurableRpcWorker` creates the forwarding Worker and Durable Object, and wires
the socket callbacks. JSON serialization is its default, matching the client
below. If your authorization implementation reads Effect `Config`, also supply
an `init` Effect that reads those settings so Alchemy discovers their bindings;
see the existing [bank Worker](../../../apps/docs/src/infra/bank/sqlite-do.ts)
for that pattern.

```ts
// alchemy.run.ts — infrastructure entry point
import { Stack } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect } from 'effect';
import CounterWorker from './counter-worker.js';

export default Stack(
  'CounterExample',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.map(CounterWorker, (worker) => ({ url: worker.url })),
);
```

Install the toolkit's declared Alchemy peer version and configure your Alchemy
Cloudflare credentials. Run `pnpm exec alchemy dev` locally, or
`pnpm exec alchemy deploy` to provision the stack. Pass the stack's `url` output
to `watchCounter` through your application's browser configuration; the socket
client converts an HTTP(S) URL to WS(S). Keep infrastructure imports out of the
browser. Preserve existing resource IDs and object names when migrating an
already deployed Worker.

Without Alchemy, build the runtime directly instead:

```ts
// durable-server.ts — host composition without Alchemy
import { Effect } from 'effect';
import { RpcSerialization } from 'effect/unstable/rpc';
import {
  fromDurableObjectState,
  makeHibernatingWebSocketRpc,
} from 'rpc-toolkit/rpc/cloudflare/hibernating-rpc';
import { Counter } from './contract.js';
import { makeHandlers } from './server.js';

export const makeServer = (
  state: Parameters<typeof fromDurableObjectState>[0],
  authorization: Parameters<typeof makeHandlers>[0],
) =>
  makeHibernatingWebSocketRpc({
    ...fromDurableObjectState(state),
    group: Counter,
    layer: makeHandlers(authorization),
  }).pipe(Effect.provide(RpcSerialization.layerJson));
```

The host wires `accept`, `message`, and `close` to its fetch, WebSocket message,
and WebSocket close callbacks, running them through its Effect integration.

```ts
// client.ts — browser only
import { Effect, Layer, Stream } from 'effect';
import { Headers } from 'effect/unstable/http';
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc';
import {
  keepSubscribed,
  layerWebSocketProtocol,
} from 'rpc-toolkit/rpc/websocket-client';
import { Access, Counter } from './contract.js';

export const watchCounter = (
  url: string,
  getToken: () => string,
  onValue: (value: number) => void,
) =>
  Effect.gen(function* () {
    const client = yield* RpcClient.make(Counter);
    yield* keepSubscribed(() => client.watch()).pipe(
      Stream.runForEach((value) => Effect.sync(() => onValue(value))),
    );
  }).pipe(
    Effect.provide(
      Layer.merge(
        layerWebSocketProtocol({
          url,
          serialization: RpcSerialization.layerJson,
        }),
        Access.clientLayer(({ request, next }) =>
          next({
            ...request,
            headers: Headers.fromInput({ authorization: getToken() }),
          }),
        ),
      ),
    ),
    Effect.scoped,
  );
```

Run `watchCounter` in the application's Effect runtime and interrupt it when the
consumer unmounts. Declared errors propagate to that runtime; cancellation stops
subscription restart. RPC headers above travel in RPC messages, not as custom
browser WebSocket upgrade headers. Hibernation reuses the original headers;
reconnect invokes `getToken` again. This counter illustrates checkpointing, not
exactly-once delivery or durable scheduling while the object is asleep.
