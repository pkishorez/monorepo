import { Effect, Fiber, Stream } from 'effect';
import { describe, expect, it } from 'vitest';
import type { KabukiSessionClient } from '../../../api/index.ts';
import { KabukiSessions, layer, unique } from '../index.ts';

const run = <A, E>(effect: Effect.Effect<A, E, KabukiSessions>) =>
  Effect.runPromise(Effect.provide(effect, layer));

// The registry only keeps the client; it never calls it.
const client = {} as KabukiSessionClient;

const asked = (name: string) => ({
  name,
  app: 'Diary',
  url: 'http://localhost:5173/',
  origin: 'http://localhost:5173',
  client,
});

describe('unique', () => {
  it('keeps a free name, and adds the first free -2, -3 on a clash', () => {
    expect(unique('diary', new Set())).toBe('diary');
    expect(unique('diary', new Set(['diary']))).toBe('diary-2');
    expect(unique('diary', new Set(['diary', 'diary-2']))).toBe('diary-3');
    expect(unique('diary', new Set(['diary', 'diary-3']))).toBe('diary-2');
  });
});

describe('KabukiSessions', () => {
  it('names each one uniquely, and frees a name once it is removed', () =>
    run(
      Effect.gen(function* () {
        const sessions = yield* KabukiSessions;
        const one = yield* sessions.add(asked('diary'));
        const two = yield* sessions.add(asked('diary'));
        expect([one.name, two.name]).toEqual(['diary', 'diary-2']);
        expect(one.connectedAt).toBeTypeOf('number');

        yield* sessions.remove(one);
        expect((yield* sessions.list).map((one) => one.name)).toEqual([
          'diary-2',
        ]);
        expect(yield* sessions.find('diary')).toBeUndefined();
        expect((yield* sessions.add(asked('diary'))).name).toBe('diary');
      }),
    ));

  it('removes only the one it is given, not another kept since under its name', () =>
    run(
      Effect.gen(function* () {
        const sessions = yield* KabukiSessions;
        const old = yield* sessions.add(asked('diary'));
        yield* sessions.remove(old);
        const kept = yield* sessions.add(asked('diary'));
        yield* sessions.remove(old);
        expect(yield* sessions.find('diary')).toBe(kept);
      }),
    ));

  it('streams the list now and after every change, and says when one is gone', () =>
    run(
      Effect.gen(function* () {
        const sessions = yield* KabukiSessions;
        const seen = yield* sessions.watch.pipe(
          Stream.map((list) => list.map((one) => one.name)),
          Stream.take(4),
          Stream.runCollect,
          Effect.forkChild,
        );
        yield* Effect.yieldNow;
        const one = yield* sessions.add(asked('diary'));
        const gone = yield* Effect.forkChild(sessions.gone(one));
        yield* sessions.add(asked('shop'));
        yield* sessions.remove(one);
        yield* Fiber.join(gone);
        expect(Array.from(yield* Fiber.join(seen))).toEqual([
          [],
          ['diary'],
          ['diary', 'shop'],
          ['shop'],
        ]);
      }),
    ));
});
