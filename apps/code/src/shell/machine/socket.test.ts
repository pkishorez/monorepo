import { Effect, Fiber, Layer, SubscriptionRef } from 'effect';
import type { Machine as MachineSchema } from '@kestack/ai-toolkit/machines';
import { Replicas } from '@kestack/std-toolkit/replica';
import { describe, expect, it } from 'vitest';
import { Machines } from '../machines/index.ts';
import { Link, nobody } from '../machines/link.ts';
import { listedOnly } from './socket.ts';

/*
 * A Machine page's Replicas over stand-in ones that record what they were
 * asked to hold: nothing of a Machine is opened until it is in the
 * signed-in Account's list, so a URL naming another Account's Machine
 * reads nothing this device keeps of it.
 */

type Machine = typeof MachineSchema.Type;

const machine = (id: string): Machine => ({
  id,
  name: id,
  key: `key-${id}`,
  version: '0.0.1',
  status: { _tag: 'Unchecked', url: `https://${id}.trycloudflare.com` },
  lastSeen: 1,
});

const wait = Effect.promise(() => new Promise((done) => setTimeout(done, 20)));

describe("a Machine page's Replicas", () => {
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
          // Account B's list, on a page at Account A's Machine.
          yield* listed([machine('mine')]);
          const opening = yield* Effect.forkScoped(
            replicas.hold('Ai', 'theirs'),
          );
          yield* wait;
          expect(held).toEqual([]);
          // Listed (as once Account A is signed in): it opens.
          yield* listed([machine('mine'), machine('theirs')]);
          yield* Fiber.join(opening);
          expect(held).toEqual(['theirs']);
        }).pipe(
          Effect.provide(
            listedOnly('theirs').pipe(
              Layer.provideMerge(Layer.merge(below, Machines.layer)),
            ),
          ),
        ),
      ),
    );
  });
});
