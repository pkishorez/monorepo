import 'fake-indexeddb/auto';
import { Effect, Fiber, Stream } from 'effect';
import { describe, expect, it } from 'vitest';
import { keys } from '../../keys.ts';
import { DeviceState } from './device-state.ts';

/*
 * Device State in memory: what is written reads back, Bindings that no
 * longer fit the keys are left out, a mark only moves forward, and every
 * write is heard. In IndexedDB, as two tabs share it: a mark only moves
 * forward however their writes interleave.
 */

const run = <A, E>(
  effect: Effect.Effect<A, E, typeof DeviceState.Store.Identifier>,
) => Effect.runPromise(effect.pipe(Effect.provide(DeviceState.memory())));

const store = Effect.map(DeviceState.Store, (store) => store);

describe('Device State', () => {
  it('reads as keeping nothing before anything is written', async () => {
    expect(await run(DeviceState.read)).toEqual(DeviceState.nothing);
  });

  it('keeps Vim Mode and Bindings', async () => {
    const read = await run(
      Effect.gen(function* () {
        const device = yield* store;
        yield* device.setVim(true);
        yield* device.setBindings({ 'picker.finish': ['ctrl+Enter'] });
        return yield* device.read;
      }),
    );
    expect(read).toEqual({
      vim: true,
      bindings: { 'picker.finish': ['ctrl+Enter'] },
      unseen: {},
      machines: {},
    });
  });

  it('leaves out Bindings that no longer fit the keys', async () => {
    const read = await run(
      Effect.gen(function* () {
        const device = yield* store;
        yield* device.setBindings({
          gone: ['ctrl+g'],
          'picker.back': ['not+a+key'],
          // Clashes with the picker's own Escape.
          'picker.pick': ['Escape'],
          'sidebar.next': ['n'],
        });
        return yield* device.read;
      }),
    );
    expect(read.bindings).toEqual({ 'sidebar.next': ['n'] });
  });

  it('leaves out Bindings until what is left fits, a default brought back included', async () => {
    const read = await run(
      Effect.gen(function* () {
        const device = yield* store;
        // Left by a Reset of Projects after Swaps: its Ctrl+P is Actions'
        // too; Actions dropped, its Ctrl+K would be Sessions' too.
        yield* device.setBindings({
          'app.sessions': ['ctrl+k'],
          'app.actions': ['ctrl+p'],
        });
        return yield* device.read;
      }),
    );
    expect(read.bindings).toEqual({});
    expect(keys.checkBindings(read.bindings).conflicts).toEqual([]);
  });

  it('moves an Unseen mark only forward', async () => {
    const read = await run(
      Effect.gen(function* () {
        const device = yield* store;
        yield* device.markSeen('m1', 's1', 20);
        yield* device.markSeen('m1', 's1', 10);
        yield* device.markSeen('m1', 's2', 0);
        return yield* device.read;
      }),
    );
    const marks = read.unseen['m1'] ?? {};
    expect(read.unseen).toEqual({ m1: { s1: 20, s2: 0 } });
    expect(DeviceState.isUnseen(marks, 's1', 30)).toBe(true);
    expect(DeviceState.isUnseen(marks, 's1', 20)).toBe(false);
    expect(DeviceState.isUnseen(marks, 's2', null)).toBe(false);
    expect(DeviceState.isUnseen(marks, 'never-opened', 30)).toBe(false);
  });

  it('keeps Unseen marks per Machine', async () => {
    const read = await run(
      Effect.gen(function* () {
        const device = yield* store;
        yield* device.markSeen('m1', 's1', 20);
        yield* device.markSeen('m2', 's1', 5);
        return yield* device.read;
      }),
    );
    expect(read.unseen).toEqual({ m1: { s1: 20 }, m2: { s1: 5 } });
  });

  it('keeps the Machine each Account was last on', async () => {
    const read = await run(
      Effect.gen(function* () {
        const device = yield* store;
        yield* device.setLastMachine('a1', 'm1');
        yield* device.setLastMachine('a2', 'm2');
        yield* device.setLastMachine('a1', 'm3');
        return yield* device.read;
      }),
    );
    expect(read.machines).toEqual({ a1: 'm3', a2: 'm2' });
  });

  it('is heard after every write', async () => {
    const heard = await run(
      Effect.gen(function* () {
        const device = yield* store;
        const listening = yield* DeviceState.changes.pipe(
          Stream.take(1),
          Stream.runCollect,
          Effect.forkChild,
        );
        yield* Effect.sleep('10 millis');
        yield* device.setVim(true);
        return yield* Fiber.join(listening);
      }),
    );
    expect(heard).toHaveLength(1);
  });
});

describe('Device State across tabs', () => {
  // Each its own Store over the one database, as two tabs are.
  const tab = <A, E>(
    effect: Effect.Effect<A, E, typeof DeviceState.Store.Identifier>,
  ) => effect.pipe(Effect.provide(DeviceState.idb));

  it.each([
    ['the later first', [300, 200]],
    ['the earlier first', [200, 300]],
  ])('moves an Unseen mark only forward, %s', async (_, [one, two]) => {
    const sessionId = `s-${one}-${two}`;
    const read = await Effect.runPromise(
      Effect.gen(function* () {
        yield* tab(
          Effect.flatMap(store, (device) =>
            device.markSeen('m1', sessionId, 100),
          ),
        );
        // Both read 100; whichever writes last must not take the mark back.
        yield* Effect.all(
          [one, two].map((seen) =>
            tab(
              Effect.flatMap(store, (device) =>
                device.markSeen('m1', sessionId, seen!),
              ),
            ),
          ),
          { concurrency: 'unbounded' },
        );
        return yield* tab(DeviceState.read);
      }),
    );
    expect(read.unseen['m1']?.[sessionId]).toBe(300);
  });
});
