import { Effect, Fiber, Layer, SubscriptionRef } from 'effect';
import { Replicas } from '@kestack/std-toolkit/replica';
import { describe, expect, it } from 'vitest';
import {
  ConnectionsChannel,
  connectionsLayer as connections,
} from '../../../../connections.ts';
import { byConnection } from '../reach.ts';

/*
 * A Connection's Instance is held by that Connection's own Replicas, and opens
 * nothing until the Connection runs here: an address naming a Connection not
 * running, such as another Account's, waits.
 */

const wait = (ms = 20) =>
  Effect.promise(() => new Promise((done) => setTimeout(done, ms)));

/** A Connection's Replicas, saying each Key it was asked to hold. */
const replicasOf = (connectionId: string, held: Array<string>) =>
  Replicas.of({
    hold: (_, key) =>
      Effect.sync(() => {
        held.push(`${connectionId}:${key}`);
        return null as never;
      }),
  });

describe('the Replicas of every Connection', () => {
  it('hold each Instance in its own Connection’s Replicas, once it runs', async () => {
    const held: Array<string> = [];
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const link = yield* ConnectionsChannel;
          const replicas = yield* Replicas;
          yield* SubscriptionRef.set(link.replicas, {
            mine: replicasOf('mine', held),
          });
          yield* replicas.hold('Ai', 'mine');
          expect(held).toEqual(['mine:mine']);
          // Not running here, as another Account's: it waits.
          const opening = yield* Effect.forkScoped(
            replicas.hold('Ai', 'theirs'),
          );
          yield* wait();
          expect(held).toEqual(['mine:mine']);
          // Runs (as once its Account is signed in): it opens, in its own.
          yield* SubscriptionRef.update(link.replicas, (now) => ({
            ...now,
            theirs: replicasOf('theirs', held),
          }));
          yield* Fiber.join(opening);
          expect(held).toEqual(['mine:mine', 'theirs:theirs']);
        }).pipe(
          Effect.provide(byConnection.pipe(Layer.provideMerge(connections))),
        ),
      ),
    );
  });
});
