import { describe, expect, it } from '@effect/vitest';
import { Effect, Fiber, Layer, Stream } from 'effect';
import type { Entity } from '../entity/index.js';
import { Broadcaster, sharedBroadcaster } from '../broadcaster/index.js';

const entity = (id: string): Entity<{ id: string }> => ({
  value: { id },
  meta: { _e: 'item', _v: 'v1', _d: false, _u: id },
});

// One participant's Broadcaster, as its own runtime builds it.
const participant = (name: string) =>
  Layer.build(sharedBroadcaster(name)).pipe(
    Effect.map(
      (context) =>
        context.mapUnsafe.get(Broadcaster.key) as Broadcaster['Service'],
    ),
  );

describe('sharedBroadcaster', () => {
  it.live('every participant hears a write, where it was made too', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const writer = yield* participant('shared-test');
        const reader = yield* participant('shared-test');
        const heardHere = yield* writer.changes.pipe(
          Stream.take(1),
          Stream.runCollect,
          Effect.forkScoped,
        );
        const heardThere = yield* reader.changes.pipe(
          Stream.take(1),
          Stream.runCollect,
          Effect.forkScoped,
        );
        yield* Effect.yieldNow;
        writer.broadcast([entity('a')]);
        const here = yield* Fiber.join(heardHere);
        const there = yield* Fiber.join(heardThere);
        expect(here).toEqual([entity('a')]);
        expect(there).toEqual([entity('a')]);
      }),
    ),
  );

  it.live('a different name hears nothing', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const writer = yield* participant('shared-one');
        const other = yield* participant('shared-two');
        const heard = yield* other.changes.pipe(
          Stream.take(1),
          Stream.runCollect,
          Effect.forkScoped,
        );
        yield* Effect.yieldNow;
        writer.broadcast([entity('a')]);
        yield* Effect.sleep('50 millis');
        expect(heard.pollUnsafe()).toBeUndefined();
      }),
    ),
  );
});
