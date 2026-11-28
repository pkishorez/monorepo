import { Effect, Layer, Schema, SubscriptionRef } from 'effect';
import { Fake } from '@kestack/kabuki/fake';
import { PortFailed, Server } from '../contract/index.js';

export const ServerState = Schema.Struct({
  port: Schema.NullOr(Schema.Finite),
  taken: Schema.Boolean,
});

const FAKE_PORT = 4242;

export const server = Fake.make({
  name: 'server',
  state: ServerState,
  initial: { port: null, taken: false },
  controls: {
    TakePort: Fake.control(ServerState, Schema.Struct({}), (_, state) =>
      SubscriptionRef.update(state, (now) => ({ ...now, taken: true })),
    ),
    FreePort: Fake.control(ServerState, Schema.Struct({}), (_, state) =>
      SubscriptionRef.update(state, (now) => ({ ...now, taken: false })),
    ),
  },
  layer: (state) =>
    Layer.succeed(
      Server,
      Server.of({
        listen: (options) =>
          Effect.gen(function* () {
            const now = yield* SubscriptionRef.get(state);
            const port = options.port === 0 ? FAKE_PORT : options.port;
            if (now.taken)
              return yield* new PortFailed({
                message: `Could not listen on 127.0.0.1:${port}: address in use`,
              });
            yield* Effect.acquireRelease(
              SubscriptionRef.update(state, (was) => ({ ...was, port })),
              () =>
                SubscriptionRef.update(state, (was) => ({
                  ...was,
                  port: null,
                })),
            );
            return port;
          }),
      }),
    ),
});

export type ServerState = typeof ServerState.Type;
