import { Effect, Layer } from 'effect';
import type { QueryOptions, StdTableService } from '@kestack/std-toolkit/db';
import { IDB } from '@kestack/std-toolkit/db/idb';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { broadcast, type Doorbell } from './doorbell.ts';
import { fitted } from './fit.ts';
import { DeviceState, type Gone, went } from '../../capabilities/index.ts';
import { keyOf, RETRIES, scan } from '../rows/index.ts';
import {
  DEVICE_TABLE,
  floating,
  keyboard,
  type Mark,
  marks,
  microphone,
  sidebar,
  sidebarWidth,
  smartDisplacement,
  smartInput,
  table,
  textSize,
  vim,
} from './layout.ts';

/*
 * Device State: what this browser keeps for itself and no other device
 * sees, in one IndexedDB database of its own: the user's own Bindings and
 * whether Vim Mode is on, whether the app floats as a window, the text size,
 * the microphone a Dictation records from, whether the Touch Draft takes Smart Input and Smart Displacement, the Machine the sidebar shows and its width,
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
 * 4. Drop    the Unseen marks of a Project removed, of a Machine forgotten
 *            or no longer listed, or of an Account signed out, are deleted.
 */

const CONFIRM = 'I KNOW WHAT I AM DOING';

const allMarks = scan((options: QueryOptions<Mark>) =>
  marks.query('primary', { pk: {}, '>=': null }, options),
);

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
  const readMarks = Effect.map(allMarks, (found) => {
    const unseen: Record<string, Record<string, number>> = {};
    for (const { machineId, sessionId, seen } of found)
      (unseen[machineId] ??= {})[sessionId] = seen;
    return unseen;
  });

  const read = Effect.gen(function* () {
    const { value } = yield* keyboard.get();
    const mode = yield* vim.get();
    const floats = yield* floating.get();
    const sized = yield* textSize.get();
    const chosen = yield* microphone.get();
    const smart = yield* smartInput.get();
    const displaced = yield* smartDisplacement.get();
    const shown = yield* sidebar.get();
    const wide = yield* sidebarWidth.get();
    const unseen = yield* readMarks;
    return {
      bindings: fitted(value.bindings),
      vim: mode.value.on,
      floating: floats.value.on,
      textSize: sized.value.size,
      microphone: chosen.value.deviceId,
      smartInput: smart.value.on,
      smartDisplacement: displaced.value.on,
      sidebarMachine: shown.value.machineId,
      sidebarWidth: wide.value.width,
      unseen,
    };
  }).pipe(Effect.provide(layer));

  // 2. Write
  const markSeen = (
    accountId: string,
    machineId: string,
    projectId: string,
    sessionId: string,
    seen: number,
  ) =>
    write(
      Effect.gen(function* () {
        const id = { mark: keyOf(machineId, sessionId) };
        const mark = yield* marks.get(id);
        if (mark === null)
          return yield* marks.insert({
            ...id,
            accountId,
            machineId,
            projectId,
            sessionId,
            seen,
          });
        // A mark only moves forward: an older Turn seen late changes nothing.
        if (
          mark.value.seen >= seen &&
          mark.value.accountId !== null &&
          mark.value.projectId !== null
        )
          return mark;
        // Judged again on the mark as written, since another tab may have
        // moved it on after it was read here.
        return yield* marks.getAndUpdate(
          id,
          (current) => ({
            seen: Math.max(current.seen, seen),
            accountId,
            projectId,
          }),
          { retries: RETRIES },
        );
      }).pipe(Effect.retry({ times: RETRIES })),
    );

  // 4. Drop
  const drop = (gone: Gone) =>
    write(
      Effect.flatMap(allMarks, (found) =>
        Effect.forEach(
          found.filter(went(gone)),
          ({ mark }) => marks.hardDelete({ mark }, CONFIRM),
          { discard: true },
        ),
      ),
    ).pipe(Effect.ignore);

  return DeviceState.of({
    read,
    setBindings: (bindings) =>
      write(keyboard.getAndUpdate(() => ({ bindings }), { retries: RETRIES })),
    setVim: (on) =>
      write(vim.getAndUpdate(() => ({ on }), { retries: RETRIES })),
    setFloating: (on) =>
      write(floating.getAndUpdate(() => ({ on }), { retries: RETRIES })),
    setTextSize: (size) =>
      write(textSize.getAndUpdate(() => ({ size }), { retries: RETRIES })),
    setMicrophone: (deviceId) =>
      write(
        microphone.getAndUpdate(() => ({ deviceId }), { retries: RETRIES }),
      ),
    setSmartInput: (on) =>
      write(smartInput.getAndUpdate(() => ({ on }), { retries: RETRIES })),
    setSmartDisplacement: (on) =>
      write(
        smartDisplacement.getAndUpdate(() => ({ on }), { retries: RETRIES }),
      ),
    setSidebarMachine: (machineId) =>
      write(sidebar.getAndUpdate(() => ({ machineId }), { retries: RETRIES })),
    setSidebarWidth: (width) =>
      write(sidebarWidth.getAndUpdate(() => ({ width }), { retries: RETRIES })),
    markSeen,
    drop,
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
