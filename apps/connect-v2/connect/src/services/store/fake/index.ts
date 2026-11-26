import { Effect, Layer, Schema, SubscriptionRef } from 'effect';
import { Fake } from '@kestack/kabuki/fake';
import { ConnectionOwnedByAnother, Store } from '../contract/index.js';

export const StoreState = Schema.Struct({
  connection: Schema.NullOr(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      owner: Schema.Struct({ id: Schema.String, email: Schema.String }),
      cloud: Schema.String,
      startedAt: Schema.Finite,
    }),
  ),
  claims: Schema.Finite,
});
export type StoreState = typeof StoreState.Type;

export const store = Fake.make({
  name: 'store',
  state: StoreState,
  initial: { connection: null, claims: 0 },
  controls: {
    Forget: Fake.control(StoreState, Schema.Struct({}), (_, state) =>
      SubscriptionRef.update(state, (now) => ({ ...now, connection: null })),
    ),
  },
  layer: (state) =>
    Layer.succeed(
      Store,
      Store.of({
        connection: Effect.map(
          SubscriptionRef.get(state),
          ({ connection }) => connection,
        ),
        claim: ({ owner, cloud, name, startedAt }) =>
          Effect.gen(function* () {
            const now = yield* SubscriptionRef.get(state);
            const kept = now.connection;
            if (kept !== null && kept.owner.id !== owner.id)
              return yield* new ConnectionOwnedByAnother({
                owner: kept.owner.email,
                user: owner.email,
              });
            const connection = kept ?? {
              id: `connection-${now.claims + 1}`,
              name,
              owner: { id: owner.id, email: owner.email },
              cloud,
              startedAt,
            };
            yield* SubscriptionRef.set(state, {
              connection,
              claims: now.claims + 1,
            });
            return { id: connection.id, name: connection.name };
          }),
        forget: SubscriptionRef.update(state, (now) => ({
          ...now,
          connection: null,
        })),
        authWorker: () => Effect.succeed(null),
        keepAuthWorker: () => Effect.void,
        signInTable: Layer.empty as never,
      }),
    ),
});
