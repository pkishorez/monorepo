import { Effect, Layer, Schema, Stream, SubscriptionRef } from 'effect';
import { Fake } from '@kestack/kabuki/fake';
import { Cloudflared, TunnelFailed } from '../contract/index.js';

export const CloudflaredState = Schema.Struct({
  url: Schema.NullOr(Schema.String),
  opened: Schema.Finite,
  broken: Schema.Boolean,
  reachable: Schema.Boolean,
});
export type CloudflaredState = typeof CloudflaredState.Type;

const set =
  (change: Partial<CloudflaredState>) =>
  (_: unknown, state: SubscriptionRef.SubscriptionRef<CloudflaredState>) =>
    SubscriptionRef.update(state, (now) => ({ ...now, ...change }));

export const cloudflared = Fake.make({
  name: 'cloudflared',
  state: CloudflaredState,
  initial: { url: null, opened: 0, broken: false, reachable: true },
  controls: {
    DropTunnel: Fake.control(CloudflaredState, Schema.Struct({}), (_, state) =>
      Effect.flatMap(SubscriptionRef.get(state), (now) =>
        now.url === null
          ? Effect.fail('No tunnel is open')
          : SubscriptionRef.set(state, { ...now, url: null }),
      ),
    ),
    Break: Fake.control(
      CloudflaredState,
      Schema.Struct({}),
      set({ broken: true }),
    ),
    Fix: Fake.control(
      CloudflaredState,
      Schema.Struct({}),
      set({ broken: false }),
    ),
    CutReach: Fake.control(
      CloudflaredState,
      Schema.Struct({}),
      set({ reachable: false }),
    ),
    RestoreReach: Fake.control(
      CloudflaredState,
      Schema.Struct({}),
      set({ reachable: true }),
    ),
  },
  layer: (state) =>
    Layer.succeed(
      Cloudflared,
      Cloudflared.of({
        open: () =>
          Effect.gen(function* () {
            const now = yield* SubscriptionRef.get(state);
            if (now.broken)
              return yield* new TunnelFailed({
                message: 'cloudflared could not reach Cloudflare',
              });
            const url = `https://fake-${now.opened + 1}.trycloudflare.com`;
            yield* Effect.acquireRelease(
              SubscriptionRef.update(state, (was) => ({
                ...was,
                url,
                opened: was.opened + 1,
              })),
              () =>
                SubscriptionRef.update(state, (was) =>
                  was.url === url ? { ...was, url: null } : was,
                ),
            );
            const closed = SubscriptionRef.changes(state).pipe(
              Stream.filter((was) => was.url !== url),
              Stream.runHead,
              Effect.asVoid,
            );
            return { url, closed };
          }),
        reachable: (url) =>
          Effect.map(
            SubscriptionRef.get(state),
            (now) => now.reachable && now.url === url,
          ),
      }),
    ),
});
