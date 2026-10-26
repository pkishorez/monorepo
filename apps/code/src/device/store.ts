import { Context, Effect, Layer, Schema, Stream } from 'effect';
import {
  browser,
  browserAccountsTable,
} from '@kestack/auth-toolkit/client/browser';
import {
  type DatabaseError,
  type SingleEntityDefinition,
  type StdTableService,
  StdTable,
} from '@kestack/std-toolkit/db';
import { type AnyUnkeyedESchema, ESchema } from '@kestack/std-toolkit/eschema';
import { IDB } from '@kestack/std-toolkit/db/idb';
import { Memory } from '@kestack/std-toolkit/db/memory';
import {
  broadcast,
  type Doorbell,
  RETRIES,
} from './account/store/rows/index.ts';

/*
 * What this device keeps for itself, in its own database, `code:device`,
 * under no Account: the Preferences, which the root page reads first and
 * every part of the app reads and writes, and the Accounts signed in here
 * as auth-toolkit last saw them, without tokens. What an Account keeps is
 * under `code:account:` (`account/store.ts`), and goes with it.
 *
 * 1. Name         the device's database.
 * 2. Preferences  what only this browser knows and is the truth: the
 *                 user's own Bindings, whether Vim Mode is on, whether the
 *                 app floats as a window, the text size, the microphone a
 *                 Dictation records from, whether the Touch Draft takes
 *                 Smart Input and Smart Displacement, and the sidebar's
 *                 width. The store is the truth; an actor that shows it
 *                 reads it again after every write, from this tab or
 *                 another. The Connection the sidebar shows is its Account's
 *                 (`account/connections/store.ts`).
 * 3. Accounts     who uses the app: auth-toolkit's `Accounts`, through the
 *                 Auth Worker at `VITE_AUTH_URL`, its Accounts last seen
 *                 kept in the `accounts` table here.
 */

// 1. Name
/** The database of this device: its Accounts and its Preferences. */
export const device = 'code:device';

// 2. Preferences
/**
 * Preferences as read: Bindings by Action id; whether Vim Mode is on;
 * whether the app floats as a window on a wide screen; the text size; the
 * microphone chosen, by the browser's `deviceId`, null for the system
 * default; whether the Touch Draft takes Smart Input: a tap opens it,
 * and another places the caret, typing only from Edit; whether it takes
 * Smart Displacement: a caret or an end dragged sits above the finger; the
 * sidebar's width on a wide screen, in px.
 */
/** How big text and spacing are, with a keyboard on a wide screen. */
export const TextSize = Schema.Literals(['small', 'medium', 'large']);
export type TextSize = typeof TextSize.Type;

export const PreferencesRead = Schema.Struct({
  bindings: Schema.Record(Schema.String, Schema.Array(Schema.String)),
  vim: Schema.Boolean,
  floating: Schema.Boolean,
  textSize: TextSize,
  microphone: Schema.NullOr(Schema.String),
  smartInput: Schema.Boolean,
  smartDisplacement: Schema.Boolean,
  sidebarWidth: Schema.Finite,
});
export type PreferencesRead = typeof PreferencesRead.Type;

/** What a browser that keeps nothing reads: the default keys, Vim Mode off, no window, medium text, the default microphone, no Smart Input nor Displacement, a sidebar 260 px wide. */
export const nothing: PreferencesRead = {
  bindings: {},
  vim: false,
  floating: false,
  textSize: 'medium',
  microphone: null,
  smartInput: false,
  smartDisplacement: false,
  sidebarWidth: 260,
};

/** The Capability that reads and writes Preferences, and says when it changed. */
export class Preferences extends Context.Service<
  Preferences,
  {
    readonly read: Effect.Effect<PreferencesRead, DatabaseError>;
    readonly setBindings: (
      bindings: PreferencesRead['bindings'],
    ) => Effect.Effect<void, DatabaseError>;
    readonly setVim: (on: boolean) => Effect.Effect<void, DatabaseError>;
    readonly setFloating: (on: boolean) => Effect.Effect<void, DatabaseError>;
    readonly setTextSize: (
      size: TextSize,
    ) => Effect.Effect<void, DatabaseError>;
    readonly setMicrophone: (
      deviceId: string | null,
    ) => Effect.Effect<void, DatabaseError>;
    readonly setSmartInput: (on: boolean) => Effect.Effect<void, DatabaseError>;
    readonly setSmartDisplacement: (
      on: boolean,
    ) => Effect.Effect<void, DatabaseError>;
    readonly setSidebarWidth: (
      width: number,
    ) => Effect.Effect<void, DatabaseError>;
    /** Once per write, here or in another tab; rings while busy fold into one. */
    readonly changes: Stream.Stream<void>;
  }
>()('code/Preferences') {
  /** Reads Preferences; a browser that cannot keep it reads as keeping nothing. */
  static readonly read = Effect.flatMap(Preferences, (store) =>
    store.read.pipe(Effect.orElseSucceed(() => nothing)),
  );
  /** Once per write, here or in another tab. */
  static readonly changes = Stream.unwrap(
    Effect.map(Preferences, (store) => store.changes),
  );
}

/*
 * How Preferences is laid out, as one StdTable: one row for the keyboard,
 * the user's own Bindings; one for whether Vim Mode is on, off until it is
 * turned on; one for whether the app floats as a window, off until it
 * is turned on; one for the text size, medium until chosen; one for the
 * microphone a Dictation records from; one each for whether the Touch
 * Draft takes Smart Input and Smart Displacement, off until turned on;
 * one for the sidebar's width. The Unseen marks are each Connection's own.
 *
 * How the Touch Draft was written before Smart Input (`DeviceTouch`, text
 * or voice) is no longer read.
 */

const PREFERENCES_TABLE = 'preferences';

const table = StdTable.make(PREFERENCES_TABLE).primary('pk', 'sk').build();

const KeyboardSchema = ESchema.make('DeviceKeyboard', {
  /** Each Action's own keys, by Action id, as people write them. */
  bindings: Schema.Record(Schema.String, Schema.Array(Schema.String)),
}).build();

const keyboard = table.singleEntity(KeyboardSchema).default({ bindings: {} });

const VimSchema = ESchema.make('DeviceVim', {
  /** Whether Vim Mode is on: plain keys as shortcuts, and the Draft read until `i`. */
  on: Schema.Boolean,
}).build();

const vim = table.singleEntity(VimSchema).default({ on: false });

const FloatingSchema = ESchema.make('DeviceFloating', {
  /** Whether the app floats as a window on a screen wider than it can be. */
  on: Schema.Boolean,
}).build();

const floating = table.singleEntity(FloatingSchema).default({ on: false });

const TextSizeSchema = ESchema.make('DeviceTextSize', {
  /** How big text and spacing are with a keyboard on a wide screen. */
  size: Schema.Literals(['small', 'medium', 'large']),
}).build();

const textSize = table.singleEntity(TextSizeSchema).default({ size: 'medium' });

const MicrophoneSchema = ESchema.make('DeviceMicrophone', {
  /** The audio input chosen, by the browser's `deviceId`; null for the system default. */
  deviceId: Schema.NullOr(Schema.String),
}).build();

const microphone = table
  .singleEntity(MicrophoneSchema)
  .default({ deviceId: null });

const SmartInputSchema = ESchema.make('DeviceSmartInput', {
  /** Whether the Touch Draft takes Smart Input: opened by a tap, typed in only from Edit. */
  on: Schema.Boolean,
}).build();

const smartInput = table.singleEntity(SmartInputSchema).default({ on: false });

const SmartDisplacementSchema = ESchema.make('DeviceSmartDisplacement', {
  /** Whether a caret or a selection's end dragged in the Touch Draft sits above the finger. */
  on: Schema.Boolean,
}).build();

const smartDisplacement = table
  .singleEntity(SmartDisplacementSchema)
  .default({ on: false });

const SidebarWidthSchema = ESchema.make('DeviceSidebarWidth', {
  /** The sidebar's width on a wide screen, in px, as last dragged. */
  width: Schema.Finite,
}).build();

const sidebarWidth = table
  .singleEntity(SidebarWidthSchema)
  .default({ width: 260 });

/** Bindings by Action id, as kept. */
type Bindings = Readonly<Record<string, ReadonlyArray<string>>>;

/**
 * What is read keeps only the Bindings that still fit the keys definition,
 * as the keys say (`fitted`, in Layout's keys): the root Layer hands it in.
 */
type Fit = (bindings: Bindings) => Bindings;

/*
 * Preferences in the `preferences` table: local only, so a StdTable on
 * std-toolkit's IndexedDB adapter rather than a Replica, which mirrors a
 * server; the adapter makes its store on first open.
 *
 * - Read    all of it at once, every row in one scan of the table, so
 *           one transaction; a row not written yet, or one that no
 *           longer reads, is its default; Bindings that no longer fit
 *           the keys definition are left out.
 * - Write   one part at a time, each a read-modify-write that retries
 *           when another tab wrote first, then rings the doorbell.
 * - Follow  every write, in this tab or another, as a change to read
 *           again: the store is the truth, and actors only mirror it.
 */

/** Each row's stored value, by the name of the part it keeps. */
type Rows = ReadonlyMap<string, unknown>;

/** One part as `rows` hold it: its row read, else its default. */
const partOf = <S extends AnyUnkeyedESchema>(
  rows: Rows,
  part: SingleEntityDefinition<typeof PREFERENCES_TABLE, S>,
): Effect.Effect<S['Type']> =>
  rows.has(part.name)
    ? Schema.decodeUnknownEffect(part.schema.schema)(rows.get(part.name)).pipe(
        Effect.orElseSucceed(() => part.defaultValue),
      )
    : Effect.succeed(part.defaultValue);

const make = (
  layer: Layer.Layer<StdTableService<typeof PREFERENCES_TABLE>>,
  doorbell: Doorbell,
  fitted: Fit,
) => {
  const write = <E, R extends StdTableService<typeof PREFERENCES_TABLE>>(
    effect: Effect.Effect<unknown, E, R>,
  ) =>
    effect.pipe(
      Effect.andThen(doorbell.ring),
      Effect.asVoid,
      Effect.provide(layer),
    );

  // 1. Read
  const read = Effect.gen(function* () {
    const stored = yield* Stream.runCollect(table.scan());
    const rows: Rows = new Map(
      stored.map(({ meta, data }) => [meta._e, data] as const),
    );
    const kept = <S extends AnyUnkeyedESchema>(
      part: SingleEntityDefinition<typeof PREFERENCES_TABLE, S>,
    ) => partOf(rows, part);
    const { bindings } = yield* kept(keyboard);
    return {
      bindings: fitted(bindings),
      vim: (yield* kept(vim)).on,
      floating: (yield* kept(floating)).on,
      textSize: (yield* kept(textSize)).size,
      microphone: (yield* kept(microphone)).deviceId,
      smartInput: (yield* kept(smartInput)).on,
      smartDisplacement: (yield* kept(smartDisplacement)).on,
      sidebarWidth: (yield* kept(sidebarWidth)).width,
    };
  }).pipe(Effect.provide(layer));

  // 2. Write
  return Preferences.of({
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
    setSidebarWidth: (width) =>
      write(sidebarWidth.getAndUpdate(() => ({ width }), { retries: RETRIES })),
    // 3. Follow
    changes: doorbell.rings,
  });
};

/** Preferences in this browser's IndexedDB, heard across its tabs, the Bindings read kept to what `fit` keeps. */
export const preferencesIdb = (fit: Fit) =>
  Layer.unwrap(
    Effect.sync(() =>
      Layer.succeed(
        Preferences,
        make(
          IDB.make(table, {
            database: IDB.database({ databaseName: device }),
            mode: 'disposable',
          }).layer,
          broadcast(device),
          fit,
        ),
      ),
    ),
  );

/** Preferences in memory, for a test: gone with the process; every Binding read is kept unless a `fit` is given. */
export const preferencesMemory = (fit: Fit = (bindings) => bindings) =>
  Layer.succeed(
    Preferences,
    make(Memory.make(table).layer, broadcast(device), fit),
  );

// 3. Accounts
/** The `accounts` table of this device's database. */
const accountsTable = <T extends Parameters<typeof IDB.make>[0]>(of: T) =>
  Layer.unwrap(
    Effect.sync(
      () =>
        IDB.make(of, {
          database: IDB.database({ databaseName: device }),
          storeName: 'accounts',
          mode: 'disposable',
        }).layer,
    ),
  );

// Made once the Layer is built, in the browser: never as the module loads.
export const accounts = Layer.unwrap(
  Effect.sync(() =>
    browser({
      url: import.meta.env.VITE_AUTH_URL,
      cache: accountsTable(browserAccountsTable),
    }),
  ),
);
