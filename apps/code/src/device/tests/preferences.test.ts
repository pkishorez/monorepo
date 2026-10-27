import 'fake-indexeddb/auto';
import { Effect, Fiber, Stream } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fitted, keys } from '../account/machines/layout/commands.ts';
import { Preferences, nothing } from '../store.ts';
import { preferencesIdb, preferencesMemory } from '../store.ts';

const idb = preferencesIdb(fitted);
const memory = () => preferencesMemory(fitted);

/*
 * Preferences in memory: what is written reads back, the microphone
 * chosen and whether the Touch Draft takes Smart Input too, Bindings that no longer fit the keys are left out,
 * and every write is heard. In IndexedDB, all of it is read in one
 * transaction.
 */

const run = <A, E>(effect: Effect.Effect<A, E, Preferences>) =>
  Effect.runPromise(effect.pipe(Effect.provide(memory())));

const store = Effect.map(Preferences, (store) => store);

describe('Preferences', () => {
  it('reads as keeping nothing before anything is written', async () => {
    expect(await run(Preferences.read)).toEqual(nothing);
  });

  it('keeps Bindings', async () => {
    const read = await run(
      Effect.gen(function* () {
        const device = yield* store;
        yield* device.setBindings({ 'picker.finish': ['ctrl+Enter'] });
        return yield* device.read;
      }),
    );
    expect(read).toEqual({
      bindings: { 'picker.finish': ['ctrl+Enter'] },
      vim: false,
      floating: false,
      textSize: 'medium',
      microphone: null,
      smartInput: false,
      smartDisplacement: false,
      sidebarWidth: 260,
    });
  });

  it('keeps the microphone chosen, and the system default again', async () => {
    const read = await run(
      Effect.gen(function* () {
        const device = yield* store;
        yield* device.setMicrophone('usb-mic');
        const chosen = (yield* device.read).microphone;
        yield* device.setMicrophone(null);
        return [chosen, (yield* device.read).microphone];
      }),
    );
    expect(read).toEqual(['usb-mic', null]);
  });

  it('keeps Smart Input, off until it is turned on', async () => {
    const read = await run(
      Effect.gen(function* () {
        const device = yield* store;
        const before = (yield* device.read).smartInput;
        yield* device.setSmartInput(true);
        return [before, (yield* device.read).smartInput];
      }),
    );
    expect(read).toEqual([false, true]);
  });

  it('keeps Smart Displacement, off until it is turned on', async () => {
    const read = await run(
      Effect.gen(function* () {
        const device = yield* store;
        const before = (yield* device.read).smartDisplacement;
        yield* device.setSmartDisplacement(true);
        return [before, (yield* device.read).smartDisplacement];
      }),
    );
    expect(read).toEqual([false, true]);
  });

  it('keeps Vim Mode, off until it is turned on', async () => {
    const read = await run(
      Effect.gen(function* () {
        const device = yield* store;
        const before = (yield* device.read).vim;
        yield* device.setVim(true);
        return [before, (yield* device.read).vim];
      }),
    );
    expect(read).toEqual([false, true]);
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
        // Left by a Reset of Projects after Swaps: its O is Actions' too;
        // Actions dropped, its A would be Sessions' too.
        yield* device.setBindings({
          'app.sessions': ['a'],
          'app.actions': ['o'],
        });
        return yield* device.read;
      }),
    );
    expect(read.bindings).toEqual({});
    expect(keys.checkBindings(read.bindings).conflicts).toEqual([]);
  });

  it('is heard after every write', async () => {
    const heard = await run(
      Effect.gen(function* () {
        const device = yield* store;
        const listening = yield* Preferences.changes.pipe(
          Stream.take(1),
          Stream.runCollect,
          Effect.forkChild,
        );
        yield* Effect.sleep('10 millis');
        yield* device.setBindings({});
        return yield* Fiber.join(listening);
      }),
    );
    expect(heard).toHaveLength(1);
  });
});

describe('Preferences in IndexedDB', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads every part in one transaction', async () => {
    const opened = vi.spyOn(IDBDatabase.prototype, 'transaction');
    const [read, transactions] = await Effect.runPromise(
      Effect.gen(function* () {
        const device = yield* store;
        yield* device.setVim(true);
        yield* device.setTextSize('large');
        yield* device.setSidebarWidth(320);
        // The database and its contract are opened by now.
        yield* device.read;
        opened.mockClear();
        const read = yield* device.read;
        return [read, opened.mock.calls.length] as const;
      }).pipe(Effect.provide(idb)),
    );
    expect(read).toEqual({
      ...nothing,
      vim: true,
      textSize: 'large',
      sidebarWidth: 320,
    });
    expect(transactions).toBe(1);
  });
});
