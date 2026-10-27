import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { MachineFilter } from '../store.ts';
import { machineFilterMemory as memory } from '../store.ts';

/*
 * The Machine Filter in memory: every Machine until one is chosen, what
 * is chosen reads back, and each Account keeps its own.
 */

const run = <A, E>(effect: Effect.Effect<A, E, MachineFilter>) =>
  Effect.runPromise(effect.pipe(Effect.provide(memory())));

describe('MachineFilter', () => {
  it('keeps the Machine the sidebar shows, and every Machine again', async () => {
    const read = await run(
      Effect.gen(function* () {
        const filter = yield* MachineFilter;
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
        const filter = yield* MachineFilter;
        yield* filter.set('a1', 'm1');
        return [yield* filter.read('a1'), yield* filter.read('a2')];
      }),
    );
    expect(read).toEqual(['m1', null]);
  });
});
