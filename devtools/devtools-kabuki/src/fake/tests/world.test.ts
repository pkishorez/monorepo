import { Effect } from 'effect';
import type { SavedSnapshot } from '@kestack/kabuki/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeWorld, FRESH, SAVE_AFTER } from '../index.ts';
import type { SavedFakes } from '../index.ts';
import { garage, Parking, weather, Weather } from './fakes.ts';

/*
 * The Fake World runs two small Fakes: one Layer serves both, a Control
 * changes what they serve, each change is saved, coalesced, as `kept` says,
 * and the next world starts from it. Start fresh clears the origin's
 * storage on the next start.
 */

const run = <A, E>(effect: Effect.Effect<A, E, never>) =>
  Effect.runPromise(effect);

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** A store in memory, counting saves. */
const memory = () => {
  const kept = new Map<string, SavedSnapshot>();
  const saves: Array<string> = [];
  const saved: SavedFakes = {
    load: (name) => kept.get(name),
    save: (name, snapshot) => {
      saves.push(name);
      kept.set(name, snapshot);
    },
  };
  return { kept, saves, saved };
};

/** What the Weather says now. */
const now = Effect.gen(function* () {
  return yield* (yield* Weather).now;
});

/** What both edges say now. */
const told = Effect.gen(function* () {
  const now = yield* (yield* Weather).now;
  const parked = yield* (yield* Parking).parked;
  return { now, parked };
});

describe('FakeWorld.make', () => {
  it('serves every Fake’s edges from one Layer, and a Control changes what they say', async () => {
    const world = FakeWorld.make([weather, garage]);
    expect(world.runtimes).toEqual([]);
    const seen = await run(
      Effect.gen(function* () {
        const before = yield* told;
        const [sky, cars] = world.runtimes;
        expect(sky?.fake.name).toBe('Weather');
        expect(cars?.fake.name).toBe('Garage');
        expect(
          sky!.runtime.root.send({ _tag: 'StartRaining', heavy: true }),
        ).toBe('handled');
        cars!.runtime.root.send({ _tag: 'AddCar', name: 'mini', color: 'red' });
        cars!.runtime.root.send({ _tag: 'AddCar', name: 'van', color: 'blue' });
        const van = (
          cars!.runtime.root.children as Record<
            string,
            ReadonlyArray<{ send: (message: object) => string }>
          >
        )['cars']![1]!;
        expect(van.send({ _tag: 'DriveAway' })).toBe('handled');
        return { before, after: yield* told };
      }).pipe(Effect.provide(world.layer)),
    );
    expect(seen.before).toEqual({ now: 'dry, 20°', parked: [] });
    expect(seen.after).toEqual({ now: 'pouring, 20°', parked: ['mini'] });
    expect(world.runtimes).toEqual([]);
  });

  it('tells its listeners as Fakes start and stop', async () => {
    const world = FakeWorld.make([weather]);
    const heard: Array<number> = [];
    const stop = world.subscribe(() => heard.push(world.runtimes.length));
    await run(now.pipe(Effect.provide(world.layer)));
    stop();
    expect(heard).toEqual([1, 0]);
  });

  it('saves each change once the Fake settles, coalesced, as `kept` says', async () => {
    const { kept, saves, saved } = memory();
    const world = FakeWorld.make([weather], { saved });
    await run(
      Effect.gen(function* () {
        yield* Weather;
        const { root } = world.runtimes[0]!.runtime;
        root.send({ _tag: 'SetTemperature', degrees: 31 });
        root.send({ _tag: 'WarnOfAStorm' });
        expect(saves).toEqual([]);
        yield* Effect.promise(() => wait(SAVE_AFTER * 2));
        expect(saves).toEqual(['Weather']);
        root.send({ _tag: 'StartRaining', heavy: false });
      }).pipe(Effect.provide(world.layer)),
    );
    // The last change is saved as the Scope closes.
    expect(saves).toEqual(['Weather', 'Weather']);
    const last = kept.get('Weather')!.root;
    expect(last._tag).toBe('Raining');
    expect(last.model).toEqual({ degrees: 31, untilReload: { storm: false } });
  });

  it('starts each Fake from its saved Snapshot', async () => {
    const { saved } = memory();
    const first = FakeWorld.make([weather, garage], { saved });
    await run(
      Effect.gen(function* () {
        yield* Weather;
        const [sky, cars] = first.runtimes;
        sky!.runtime.root.send({ _tag: 'SetTemperature', degrees: 5 });
        sky!.runtime.root.send({ _tag: 'WarnOfAStorm' });
        cars!.runtime.root.send({ _tag: 'AddCar', name: 'mini', color: 'red' });
      }).pipe(Effect.provide(first.layer)),
    );
    const again = FakeWorld.make([weather, garage], { saved });
    const seen = await run(told.pipe(Effect.provide(again.layer)));
    expect(seen).toEqual({ now: 'dry, 5°', parked: ['mini'] });
  });

  it('starts blank from a saved Snapshot that no longer fits', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const saved: SavedFakes = {
      load: () => ({
        root: { address: 'Weather', _tag: 'Windy' } as never,
        at: 0,
      }),
      save: () => {},
    };
    const world = FakeWorld.make([weather], { saved });
    expect(await run(now.pipe(Effect.provide(world.layer)))).toBe('dry, 20°');
    expect(warned).toHaveBeenCalledOnce();
    warned.mockRestore();
  });
});

describe('Start fresh', () => {
  afterEach(() => vi.unstubAllGlobals());

  const storage = () => {
    const items = new Map<string, string>();
    return {
      items,
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      clear: () => items.clear(),
    };
  };

  const stub = () => {
    const session = storage();
    const local = storage();
    const deleted: Array<string> = [];
    const reload = vi.fn();
    vi.stubGlobal('sessionStorage', session);
    vi.stubGlobal('localStorage', local);
    vi.stubGlobal('location', { reload });
    vi.stubGlobal('indexedDB', {
      databases: async () => [{ name: 'tables' }, { name: 'snapshots' }],
      deleteDatabase: (name: string) => {
        deleted.push(name);
        const request: { onsuccess?: () => void } = {};
        queueMicrotask(() => request.onsuccess?.());
        return request;
      },
    });
    return { session, local, deleted, reload };
  };

  it('clears nothing unless asked', async () => {
    const { local, deleted } = stub();
    local.setItem('kept', 'yes');
    expect(await FakeWorld.beforeStart()).toBe(false);
    expect(deleted).toEqual([]);
    expect(local.items.size).toBe(1);
  });

  it('asks with a flag and a reload, then deletes every database and both storages', async () => {
    const { session, local, deleted, reload } = stub();
    local.setItem('kept', 'yes');
    FakeWorld.startFresh();
    expect(session.getItem(FRESH)).toBe('yes');
    expect(reload).toHaveBeenCalledOnce();
    expect(await FakeWorld.beforeStart()).toBe(true);
    expect(deleted).toEqual(['tables', 'snapshots']);
    expect(local.items.size).toBe(0);
    expect(session.getItem(FRESH)).toBeNull();
    expect(await FakeWorld.beforeStart()).toBe(false);
  });
});
