import 'fake-indexeddb/auto';
import { Effect, Fiber, Stream } from 'effect';
import { describe, expect, it } from 'vitest';
import { Seen } from '../index.ts';
import { idb, memory } from '../store.ts';

/*
 * The Unseen marks, each Machine's in its own database: a mark only moves
 * forward, each Machine reads its own and no other's, a Project removed
 * takes its marks and no other's, and each write is heard by its Machine.
 * In IndexedDB, as two tabs share it: a mark only moves forward however
 * their writes interleave.
 */

const run = <A, E>(effect: Effect.Effect<A, E, Seen>) =>
  Effect.runPromise(Effect.scoped(effect.pipe(Effect.provide(memory()))));

describe('Seen', () => {
  it('moves a mark only forward', async () => {
    const read = await run(
      Effect.gen(function* () {
        const seen = yield* Seen;
        yield* seen.mark('a1', 'm1', 'p1', 's1', 20);
        yield* seen.mark('a1', 'm1', 'p1', 's1', 10);
        yield* seen.mark('a1', 'm1', 'p1', 's2', 0);
        return yield* seen.read('a1', 'm1');
      }),
    );
    expect(read).toEqual({ s1: 20, s2: 0 });
  });

  it('keeps each Machine’s marks to itself, of each Account', async () => {
    const read = await run(
      Effect.gen(function* () {
        const seen = yield* Seen;
        yield* seen.mark('a1', 'm1', 'p1', 's1', 20);
        yield* seen.mark('a1', 'm2', 'p1', 's1', 5);
        yield* seen.mark('a2', 'm1', 'p1', 's2', 7);
        return [
          yield* seen.read('a1', 'm1'),
          yield* seen.read('a1', 'm2'),
          yield* seen.read('a2', 'm1'),
        ];
      }),
    );
    expect(read).toEqual([{ s1: 20 }, { s1: 5 }, { s2: 7 }]);
  });

  it("deletes a removed Project's marks, and no other Project's", async () => {
    const read = await run(
      Effect.gen(function* () {
        const seen = yield* Seen;
        yield* seen.mark('a1', 'm1', 'p1', 's1', 1);
        yield* seen.mark('a1', 'm1', 'p2', 's2', 2);
        yield* seen.mark('a1', 'm2', 'p1', 's3', 3);
        yield* seen.drop({
          _tag: 'Project',
          accountId: 'a1',
          machineId: 'm1',
          projectId: 'p1',
        });
        return [yield* seen.read('a1', 'm1'), yield* seen.read('a1', 'm2')];
      }),
    );
    expect(read).toEqual([{ s2: 2 }, { s3: 3 }]);
  });

  it('makes no mark asked as its Machine went', async () => {
    const read = await run(
      Effect.gen(function* () {
        const seen = yield* Seen;
        yield* Effect.all(
          [
            seen.mark('a1', 'm1', 'p1', 's1', 1),
            seen.drop({ _tag: 'Machine', accountId: 'a1', machineId: 'm1' }),
          ],
          { concurrency: 'unbounded' },
        );
        return yield* seen.read('a1', 'm1');
      }),
    );
    expect(read).toEqual({});
  });

  it('is heard by its Machine after every write', async () => {
    const heard = await run(
      Effect.gen(function* () {
        const seen = yield* Seen;
        const listening = yield* seen
          .changes('a1', 'm1')
          .pipe(Stream.take(1), Stream.runCollect, Effect.forkChild);
        yield* Effect.sleep('10 millis');
        yield* seen.mark('a1', 'm1', 'p1', 's1', 1);
        return yield* Fiber.join(listening);
      }),
    );
    expect(heard).toHaveLength(1);
  });
});

describe('Seen across tabs', () => {
  // Each its own Layer over the one database, as two tabs are.
  const tab = <A, E>(effect: Effect.Effect<A, E, Seen>) =>
    Effect.scoped(effect.pipe(Effect.provide(idb)));

  it.each([
    ['the later first', [300, 200]],
    ['the earlier first', [200, 300]],
  ])('moves a mark only forward, %s', async (_, [one, two]) => {
    const sessionId = `s-${one}-${two}`;
    const read = await Effect.runPromise(
      Effect.gen(function* () {
        yield* tab(
          Effect.flatMap(Seen, (seen) =>
            seen.mark('a1', 'm1', 'p1', sessionId, 100),
          ),
        );
        // Both read 100; whichever writes last must not take the mark back.
        yield* Effect.all(
          [one, two].map((at) =>
            tab(
              Effect.flatMap(Seen, (seen) =>
                seen.mark('a1', 'm1', 'p1', sessionId, at!),
              ),
            ),
          ),
          { concurrency: 'unbounded' },
        );
        return yield* tab(
          Effect.flatMap(Seen, (seen) => seen.read('a1', 'm1')),
        );
      }),
    );
    expect(read[sessionId]).toBe(300);
  });
});
