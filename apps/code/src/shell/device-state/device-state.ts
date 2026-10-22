import { Context, Effect, Layer, Schema, Stream } from 'effect';
import { Command } from '@kestack/kabuki';
import type { Entity } from '@kestack/std-toolkit/core';
import type {
  DatabaseError,
  QueryOptions,
  QueryPage,
  StdTableService,
} from '@kestack/std-toolkit/db';
import { IDB } from '@kestack/std-toolkit/db/idb';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { broadcast, type Doorbell } from './doorbell.ts';
import { fitted } from './fit.ts';
import {
  DEVICE_TABLE,
  keyboard,
  type LastMachine,
  lastMachines,
  type Mark,
  markOf,
  marks,
  table,
} from './layout.ts';

/*
 * Device State: what this browser keeps for itself and no other device
 * sees, in one IndexedDB database of its own: Vim Mode, the user's own
 * Bindings, the Unseen marks of each Machine, and the Machine each Account
 * was last on. It is local only, so it is a StdTable on
 * std-toolkit's IndexedDB adapter rather than a Replica, which mirrors a
 * server; the adapter makes its store on first open.
 *
 * 1. Read    all of it at once; Bindings that no longer fit the keys
 *            definition are left out.
 * 2. Write   one part at a time, each a read-modify-write that retries
 *            when another tab wrote first, then rings the doorbell.
 * 3. Follow  every write, in this tab or another, as a change to read
 *            again: the store is the truth, and actors only mirror it.
 *
 * An Unseen mark is a Machine's Session with the end time of the last
 * Turn seen on this device. A Session is Unseen when its last Turn ended
 * after that; one never opened here has no mark, and is never Unseen.
 */

/** One Machine's Unseen marks, by Session id. */
const Marks = Schema.Record(Schema.String, Schema.Finite);
type Marks = typeof Marks.Type;

/**
 * Device State as read: Vim Mode, Bindings by Action id, Unseen marks by
 * Machine id and then Session id, and the Machine last on by Account id.
 */
const Device = Schema.Struct({
  vim: Schema.Boolean,
  bindings: Schema.Record(Schema.String, Schema.Array(Schema.String)),
  unseen: Schema.Record(Schema.String, Marks),
  machines: Schema.Record(Schema.String, Schema.String),
});
type Device = typeof Device.Type;

/** What a browser that keeps nothing reads: Vim Mode off, the default keys, no marks, no Machine. */
const nothing: Device = { vim: false, bindings: {}, unseen: {}, machines: {} };

/** The Capability that reads and writes Device State, and says when it changed. */
class Store extends Context.Service<
  Store,
  {
    readonly read: Effect.Effect<Device, DatabaseError>;
    readonly setVim: (on: boolean) => Effect.Effect<void, DatabaseError>;
    readonly setBindings: (
      bindings: Device['bindings'],
    ) => Effect.Effect<void, DatabaseError>;
    readonly markSeen: (
      machineId: string,
      sessionId: string,
      seen: number,
    ) => Effect.Effect<void, DatabaseError>;
    readonly setLastMachine: (
      accountId: string,
      machineId: string,
    ) => Effect.Effect<void, DatabaseError>;
    /** Once per write, here or in another tab; rings while busy fold into one. */
    readonly changes: Stream.Stream<void>;
  }
>()('code/DeviceState') {}

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

  const readMachines = Effect.gen(function* () {
    const machines: Record<string, string> = {};
    let options: QueryOptions<LastMachine> = { limit: PAGE };
    while (true) {
      const page: QueryPage<Entity<LastMachine>> = yield* lastMachines.query(
        'primary',
        { pk: {}, '>=': null },
        options,
      );
      for (const { value } of page.items)
        machines[value.accountId] = value.machineId;
      const last = page.items.at(-1);
      if (!page.hasMore || last === undefined) return machines;
      options = { limit: PAGE, after: last };
    }
  });

  const read = Effect.gen(function* () {
    const { value } = yield* keyboard.get();
    const unseen = yield* readMarks;
    const machines = yield* readMachines;
    return {
      vim: value.vim,
      bindings: fitted(value.bindings),
      unseen,
      machines,
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

  return Store.of({
    read,
    setVim: (on) =>
      write(keyboard.getAndUpdate(() => ({ vim: on }), { retries: RETRIES })),
    setBindings: (bindings) =>
      write(keyboard.getAndUpdate(() => ({ bindings }), { retries: RETRIES })),
    markSeen,
    setLastMachine: (accountId, machineId) =>
      write(
        Effect.gen(function* () {
          const last = yield* lastMachines.get({ accountId });
          if (last === null)
            return yield* lastMachines.insert({ accountId, machineId });
          if (last.value.machineId === machineId) return last;
          return yield* lastMachines.getAndUpdate(
            { accountId },
            () => ({ machineId }),
            { retries: RETRIES },
          );
        }).pipe(Effect.retry({ times: RETRIES })),
      ),
    // 3. Follow
    changes: doorbell.rings,
  });
};

/** Device State in this browser's IndexedDB, heard across its tabs. */
const idb = Layer.unwrap(
  Effect.sync(() =>
    Layer.succeed(
      Store,
      make(
        IDB.make(table, {
          database: IDB.database({ databaseName: 'code:device' }),
        }).layer,
        broadcast(),
      ),
    ),
  ),
);

/** Device State in memory, for a test: gone with the process. */
const memory = () =>
  Layer.succeed(Store, make(Memory.make(table).layer, broadcast()));

/** Reads Device State; a browser that cannot keep it reads as keeping nothing. */
const readOrNothing = Effect.flatMap(Store, (store) =>
  store.read.pipe(Effect.orElseSucceed(() => nothing)),
);

// Commands: what an actor asks for, each ending in no Message. A write
// that fails is lost, and what is read stays as it was.

const setVim = Command.make('SetVimMode', {
  args: Schema.Struct({ on: Schema.Boolean }),
  run: ({ on }) =>
    Effect.flatMap(Store, (store) => store.setVim(on)).pipe(Effect.ignore),
});

const setBindings = Command.make('SetBindings', {
  args: Schema.Struct({ bindings: Device.fields.bindings }),
  run: ({ bindings }) =>
    Effect.flatMap(Store, (store) => store.setBindings(bindings)).pipe(
      Effect.ignore,
    ),
});

const markSeen = Command.make('MarkSeen', {
  args: Schema.Struct({
    machineId: Schema.String,
    sessionId: Schema.String,
    seen: Schema.Finite,
  }),
  run: ({ machineId, sessionId, seen }) =>
    Effect.flatMap(Store, (store) =>
      store.markSeen(machineId, sessionId, seen),
    ).pipe(Effect.ignore),
});

/** Remembers the Machine an Account is on, to open it first next time. */
const setLastMachine = (accountId: string, machineId: string) =>
  Effect.flatMap(Store, (store) =>
    store.setLastMachine(accountId, machineId),
  ).pipe(Effect.ignore);

/** Whether a Session is Unseen: its last Turn ended after the mark this device keeps for it, among its Machine's marks. */
const isUnseen = (
  unseen: Marks,
  sessionId: string,
  lastEnded: number | null,
) => {
  const seen = unseen[sessionId];
  return seen !== undefined && lastEnded !== null && lastEnded > seen;
};

export const DeviceState = {
  Device,
  Store,
  idb,
  memory,
  nothing,
  read: readOrNothing,
  changes: Stream.unwrap(Effect.map(Store, (store) => store.changes)),
  setVim,
  setBindings,
  markSeen,
  setLastMachine,
  isUnseen,
} as const;
