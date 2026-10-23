import { Effect, Layer } from 'effect';
import type { Entity } from '@kestack/std-toolkit/core';
import type {
  QueryOptions,
  QueryPage,
  StdTableService,
} from '@kestack/std-toolkit/db';
import { IDB } from '@kestack/std-toolkit/db/idb';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { broadcast, type Doorbell } from './doorbell.ts';
import { fitted } from './fit.ts';
import { DeviceState } from '../../capabilities/index.ts';
import {
  DEVICE_TABLE,
  keyboard,
  type Mark,
  markOf,
  marks,
  microphone,
  sidebar,
  table,
  vim,
} from './layout.ts';

/*
 * Device State: what this browser keeps for itself and no other device
 * sees, in one IndexedDB database of its own: the user's own Bindings and
 * whether Vim Mode is on,
 * the microphone a Dictation records from, the Machine the sidebar shows,
 * and the Unseen marks of each Machine. It is local only, so it is a StdTable on
 * std-toolkit's IndexedDB adapter rather than a Replica, which mirrors a
 * server; the adapter makes its store on first open.
 *
 * 1. Read    all of it at once; Bindings that no longer fit the keys
 *            definition are left out.
 * 2. Write   one part at a time, each a read-modify-write that retries
 *            when another tab wrote first, then rings the doorbell.
 * 3. Follow  every write, in this tab or another, as a change to read
 *            again: the store is the truth, and actors only mirror it.
 */

const PAGE = 500;
const RETRIES = 5;

const make = (
  layer: Layer.Layer<StdTableService<typeof DEVICE_TABLE>>,
  doorbell: Doorbell,
) => {
  const write = <E, R extends StdTableService<typeof DEVICE_TABLE>>(
    effect: Effect.Effect<unknown, E, R>,
  ) =>
    effect.pipe(
      Effect.andThen(doorbell.ring),
      Effect.asVoid,
      Effect.provide(layer),
    );

  // 1. Read
  const readMarks = Effect.gen(function* () {
    const unseen: Record<string, Record<string, number>> = {};
    let options: QueryOptions<Mark> = { limit: PAGE };
    while (true) {
      const page: QueryPage<Entity<Mark>> = yield* marks.query(
        'primary',
        { pk: {}, '>=': null },
        options,
      );
      for (const { value } of page.items)
        (unseen[value.machineId] ??= {})[value.sessionId] = value.seen;
      const last = page.items.at(-1);
      if (!page.hasMore || last === undefined) return unseen;
      options = { limit: PAGE, after: last };
    }
  });

  const read = Effect.gen(function* () {
    const { value } = yield* keyboard.get();
    const mode = yield* vim.get();
    const chosen = yield* microphone.get();
    const shown = yield* sidebar.get();
    const unseen = yield* readMarks;
    return {
      bindings: fitted(value.bindings),
      vim: mode.value.on,
      microphone: chosen.value.deviceId,
      sidebarMachine: shown.value.machineId,
      unseen,
    };
  }).pipe(Effect.provide(layer));

  // 2. Write
  const markSeen = (machineId: string, sessionId: string, seen: number) =>
    write(
      Effect.gen(function* () {
        const id = { mark: markOf(machineId, sessionId) };
        const mark = yield* marks.get(id);
        if (mark === null)
          return yield* marks.insert({ ...id, machineId, sessionId, seen });
        // A mark only moves forward: an older Turn seen late changes nothing.
        if (mark.value.seen >= seen) return mark;
        // Judged again on the mark as written, since another tab may have
        // moved it on after it was read here.
        return yield* marks.getAndUpdate(
          id,
          (current) => ({ seen: Math.max(current.seen, seen) }),
          { retries: RETRIES },
        );
      }).pipe(Effect.retry({ times: RETRIES })),
    );

  return DeviceState.of({
    read,
    setBindings: (bindings) =>
      write(keyboard.getAndUpdate(() => ({ bindings }), { retries: RETRIES })),
    setVim: (on) =>
      write(vim.getAndUpdate(() => ({ on }), { retries: RETRIES })),
    setMicrophone: (deviceId) =>
      write(
        microphone.getAndUpdate(() => ({ deviceId }), { retries: RETRIES }),
      ),
    setSidebarMachine: (machineId) =>
      write(sidebar.getAndUpdate(() => ({ machineId }), { retries: RETRIES })),
    markSeen,
    // 3. Follow
    changes: doorbell.rings,
  });
};

/** Device State in this browser's IndexedDB, heard across its tabs. */
const idb = Layer.unwrap(
  Effect.sync(() =>
    Layer.succeed(
      DeviceState,
      make(
        IDB.make(table, {
          database: IDB.database({ databaseName: 'code:device' }),
          mode: 'disposable',
        }).layer,
        broadcast(),
      ),
    ),
  ),
);

/** Device State in memory, for a test: gone with the process. */
const memory = () =>
  Layer.succeed(DeviceState, make(Memory.make(table).layer, broadcast()));

export { idb, memory };
