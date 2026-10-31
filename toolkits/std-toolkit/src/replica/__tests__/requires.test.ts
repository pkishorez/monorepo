import { Actor, Runtime } from '@kestack/kabuki';
import { Context, Effect, Layer, Stream } from 'effect';
import { expect, it } from 'vitest';
import { oldToNew, Replica, Replicas } from '../index.js';
import { Store } from '../store/memory/index.js';
import { Pocket } from './fixtures.js';

class Backend extends Context.Service<
  Backend,
  { readonly wallets: (account: string) => Effect.Effect<ReadonlyArray<never>> }
>()('test/Backend') {}

class SignedIn extends Context.Service<SignedIn, Stream.Stream<boolean>>()(
  'test/SignedIn',
) {}

it("needs what the Gate and the Strategies use from the app's Layer", () => {
  const PocketLive = Replica.build(Pocket, {
    gcTime: '1 second',
    gate: () => Stream.unwrap(Effect.map(SignedIn, (signedIn) => signedIn)),
    collections: {
      wallets: {
        strategy: oldToNew({
          fetch: ({ key }) =>
            Effect.flatMap(Backend, (backend) => backend.wallets(key)),
        }),
      },
    },
  });
  const Root = Actor.define('Root', {}).build({
    provides: () => Replicas.layer,
    children: { replicas: Actor.child(Replicas.actor([PocketLive])) },
  });
  const covered = Runtime.start(
    Root,
    Layer.mergeAll(
      Store.memory(),
      Layer.succeed(Backend, { wallets: () => Effect.succeed([]) }),
      Layer.succeed(SignedIn, Stream.make(true)),
    ),
  );
  // @ts-expect-error Backend and SignedIn are still needed
  const short = Runtime.start(Root, Store.memory());
  expect([covered, short]).toBeDefined();
});
