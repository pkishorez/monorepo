import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { ConnectionFilter } from '../store.ts';
import { connectionFilterMemory as memory } from '../store.ts';

/*
 * The Connection Filter in memory: every Connection until one is chosen, what
 * is chosen reads back, and each Account keeps its own; and the Connections
 * the sidebar shows collapsed beside it, alike.
 */

const run = <A, E>(effect: Effect.Effect<A, E, ConnectionFilter>) =>
  Effect.runPromise(effect.pipe(Effect.provide(memory())));

describe('ConnectionFilter', () => {
  it('keeps the Connection the sidebar shows, and every Connection again', async () => {
    const read = await run(
      Effect.gen(function* () {
        const filter = yield* ConnectionFilter;
        const before = yield* filter.read('a1');
        yield* filter.set('a1', 'm1');
        const shown = yield* filter.read('a1');
        yield* filter.set('a1', null);
        return [before, shown, yield* filter.read('a1')];
      }),
    );
    expect(read).toEqual([null, 'm1', null]);
  });

  it("keeps each Account's own", async () => {
    const read = await run(
      Effect.gen(function* () {
        const filter = yield* ConnectionFilter;
        yield* filter.set('a1', 'm1');
        return [yield* filter.read('a1'), yield* filter.read('a2')];
      }),
    );
    expect(read).toEqual(['m1', null]);
  });

  it("keeps the Connections collapsed, each Account's own, apart from the Filter", async () => {
    const read = await run(
      Effect.gen(function* () {
        const filter = yield* ConnectionFilter;
        const before = yield* filter.collapsed('a1');
        yield* filter.set('a1', 'm1');
        yield* filter.setCollapsed('a1', ['m2', 'm3']);
        const kept = yield* filter.collapsed('a1');
        yield* filter.setCollapsed('a1', ['m3']);
        return [
          before,
          kept,
          yield* filter.collapsed('a1'),
          yield* filter.collapsed('a2'),
          yield* filter.read('a1'),
        ];
      }),
    );
    expect(read).toEqual([[], ['m2', 'm3'], ['m3'], [], 'm1']);
  });
});
