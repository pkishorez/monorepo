# Middleware over the websocket Transport

Keep the contract, server implementation, and browser implementation in separate
files. The application supplies its token verifier; this example does not treat
client-supplied identity or roles as trusted authorization.

```ts
// contract.ts — imported by the server and browser
import { Schema } from 'effect';
import { Rpc as EffectRpc, RpcGroup } from 'effect/rpc';
import { Rpc } from '@kstackz/rpc-toolkit/rpc';

export class Forbidden extends Schema.Error<Forbidden>('example/Forbidden')({
  _tag: Schema.tag('Forbidden'),
}) {}

export const Access = Rpc.middleware<boolean>()('example/Access', {
  error: Forbidden,
  client: true,
});

export const Counter = Access.with(true)(
  RpcGroup.make(
    EffectRpc.make('watch', { success: Schema.Number, stream: true }),
  ),
);
```

```ts
// server.ts — server only
import { Effect, Layer, Option, Schema, Stream } from 'effect';
import { Rpc } from '@kstackz/rpc-toolkit/rpc';
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
        if ((yield* Rpc.websocket.InvocationKind) === 'fresh') {
          yield* options.checkRateLimit(headers.authorization);
        }
      }),
    ),
    Counter.toLayer({
      watch: () =>
        Stream.unwrap(
          Effect.gen(function* () {
            const checkpoint = yield* Rpc.websocket.checkpoint(Schema.Number);
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
import { DurableRpcWorker } from '@kstackz/rpc-toolkit/alchemy';
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
the socket callbacks. The server and client both speak JSON, so there is no
serialization to match. If your authorization implementation reads Effect `Config`, also supply
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
import { Rpc } from '@kstackz/rpc-toolkit/rpc';
import { Counter } from './contract.js';
import { makeHandlers } from './server.js';

export const makeServer = (
  state: Parameters<typeof Rpc.websocket.fromDurableObjectState>[0],
  authorization: Parameters<typeof makeHandlers>[0],
) =>
  Rpc.websocket.server(
    Counter,
    makeHandlers(authorization),
    Rpc.websocket.fromDurableObjectState(state),
  );
```

The host wires `accept`, `message`, and `close` to its fetch, WebSocket message,
and WebSocket close callbacks, running them through its Effect integration.

```ts
// client.ts — browser only
import { Effect, Layer, Stream } from 'effect';
import { Headers } from 'effect/http';
import { RpcClient } from 'effect/rpc';
import { Rpc } from '@kstackz/rpc-toolkit/rpc';
import { Access, Counter } from './contract.js';

export const watchCounter = (
  url: string,
  getToken: () => string,
  onValue: (value: number) => void,
) =>
  Effect.gen(function* () {
    const client = yield* RpcClient.make(Counter);
    yield* Rpc.websocket
      .keepSubscribed(() => client.watch())
      .pipe(Stream.runForEach((value) => Effect.sync(() => onValue(value))));
  }).pipe(
    Effect.provide(
      Layer.merge(
        Rpc.websocket.client(Counter, { url }),
        Access.client(({ request, next }) =>
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
