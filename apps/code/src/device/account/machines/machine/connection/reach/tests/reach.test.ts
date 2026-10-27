import { Effect, Fiber, Layer, SubscriptionRef } from 'effect';
import { Replicas } from '@kestack/std-toolkit/replica';
import { describe, expect, it } from 'vitest';
import { Link, machinesLayer as machines } from '../../../../machines.ts';
import { byMachine } from '../reach.ts';

/*
 * A Machine's Instance is held by that Machine's own Replicas, and opens
 * nothing until the Machine runs here: an address naming a Machine not
 * running, such as another Account's, waits.
 */

const wait = (ms = 20) =>
  Effect.promise(() => new Promise((done) => setTimeout(done, ms)));

/** A Machine's Replicas, saying each Key it was asked to hold. */
const replicasOf = (machineId: string, held: Array<string>) =>
  Replicas.of({
    hold: (_, key) =>
      Effect.sync(() => {
        held.push(`${machineId}:${key}`);
        return null as never;
      }),
  });

describe('the Replicas of every Machine', () => {
  it('hold each Instance in its own Machine’s Replicas, once it runs', async () => {
    const held: Array<string> = [];
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const link = yield* Link;
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
        }).pipe(Effect.provide(byMachine.pipe(Layer.provideMerge(machines)))),
      ),
    );
  });
});
