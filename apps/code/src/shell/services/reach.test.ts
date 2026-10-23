import { Effect, Fiber, Layer, SubscriptionRef } from 'effect';
import type { Machine as MachineSchema } from '@kestack/ai-toolkit/machines';
import { Replicas } from '@kestack/std-toolkit/replica';
import { describe, expect, it } from 'vitest';
import { Link, nobody } from '../../layer/capabilities/index.ts';
import { machines } from '../../layer/services/index.ts';
import { listedOnly } from './reach.ts';

/*
 * No Machine's Instance opens until the signed-in Account lists it.
 */

type Machine = typeof MachineSchema.Type;

const machine = (
  id: string,
  lastSeen: number,
  url: string | null = `https://${id}.trycloudflare.com`,
): Machine => ({
  id,
  name: id,
  key: `key-${id}`,
  version: '0.0.1',
  status:
    url === null
      ? { _tag: 'Opening' }
      : { _tag: 'Reachable', url, at: lastSeen },
  lastSeen,
});

const wait = (ms = 20) =>
  Effect.promise(() => new Promise((done) => setTimeout(done, ms)));

describe('the Replicas of every Machine', () => {
  it("open nothing of a Machine until it is in the Account's list", async () => {
    const held: Array<string> = [];
    const below = Layer.succeed(
      Replicas,
      Replicas.of({
        hold: (_, key) =>
          Effect.sync(() => {
            held.push(key);
            return null as never;
          }),
      }),
    );
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { known } = yield* Link;
          const replicas = yield* Replicas;
          const listed = (machines: ReadonlyArray<Machine>) =>
            SubscriptionRef.set(known, {
              ...nobody,
              accountId: 'b',
              machines,
              fetchedAt: 1,
            });
          // Account B's list, and an address naming Account A's Machine.
          yield* listed([machine('mine', 1)]);
          const opening = yield* Effect.forkScoped(
            replicas.hold('Ai', 'theirs'),
          );
          yield* wait();
          expect(held).toEqual([]);
          // Listed (as once Account A is signed in): it opens.
          yield* listed([machine('mine', 1), machine('theirs', 1)]);
          yield* Fiber.join(opening);
          expect(held).toEqual(['theirs']);
        }).pipe(
          Effect.provide(
            listedOnly.pipe(Layer.provideMerge(Layer.merge(below, machines))),
          ),
        ),
      ),
    );
  });
});
