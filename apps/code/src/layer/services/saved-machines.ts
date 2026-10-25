import { Effect, Layer, Schema } from 'effect';
import {
  Machine as MachineSchema,
  SpeechToTextState,
} from '@kestack/connect/code';
import { StdTable, type StdTableService } from '@kestack/std-toolkit/db';
import { IDB } from '@kestack/std-toolkit/db/idb';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { EntityESchema } from '@kestack/std-toolkit/eschema';
import {
  noSettings,
  SavedMachines,
  type SavedSettings,
} from '../capabilities/index.ts';

/*
 * The last list of Machines each Account was given here, in this browser's
 * IndexedDB, so the app opens on the last Machine even while Cloud Connect
 * is out of reach; and beside it, each of those Machines' settings as it
 * last said them, so Settings shows them before the Machine answers.
 * One row per Account, and one per Account and Machine; an Account signed
 * out keeps an empty list. Nothing here is the truth: Cloud Connect's next
 * answer, and the Machine's, replace it.
 */

// Kept as JSON: a Machine's numbers, and a download's, are plain
// `Schema.Number`, which an ESchema refuses to keep as a field.
const SavedSchema = EntityESchema.make('SavedMachines', 'accountId', {
  machines: Schema.String,
}).build();

const SettingsSchema = EntityESchema.make('SavedMachineSettings', 'key', {
  speech: Schema.NullOr(Schema.String),
}).build();

const List = Schema.fromJsonString(Schema.Array(MachineSchema));
const decode = Schema.decodeUnknownEffect(List);
const encode = Schema.encodeEffect(List);

const Speech = Schema.fromJsonString(SpeechToTextState);

/** A part kept as JSON, read back; null when never kept or no longer read. */
const readPart = <A>(
  codec: Schema.Codec<A, string>,
  json: string | null,
): Effect.Effect<A | null> =>
  json === null
    ? Effect.succeed(null)
    : Schema.decodeUnknownEffect(codec)(json).pipe(
        Effect.orElseSucceed(() => null),
      );

const TABLE = 'machines';

const table = StdTable.make(TABLE).primary('pk', 'sk').build();

const rows = table.entity(SavedSchema).primary().build();

const settingsRows = table.entity(SettingsSchema).primary().build();

/** A Machine's settings row's id: its Account's and its own, which no id holds a space of. */
const keyOf = (accountId: string, machineId: string) =>
  `${accountId} ${machineId}`;

const RETRIES = 5;

const make = (layer: Layer.Layer<StdTableService<typeof TABLE>>) =>
  SavedMachines.of({
    read: (accountId) =>
      rows.get({ accountId }).pipe(
        Effect.flatMap((row) =>
          row === null ? Effect.succeed(null) : decode(row.value.machines),
        ),
        Effect.provide(layer),
        Effect.orElseSucceed(() => null),
      ),
    write: (accountId, machines) =>
      Effect.gen(function* () {
        const json = yield* encode(machines);
        const row = yield* rows.get({ accountId });
        if (row === null)
          return yield* rows.insert({ accountId, machines: json });
        return yield* rows.getAndUpdate(
          { accountId },
          () => ({ machines: json }),
          { retries: RETRIES },
        );
      }).pipe(
        Effect.retry({ times: RETRIES }),
        Effect.provide(layer),
        Effect.ignore,
      ),
    settings: (accountId, machineId) =>
      Effect.gen(function* () {
        const row = yield* settingsRows.get({
          key: keyOf(accountId, machineId),
        });
        if (row === null) return noSettings;
        return {
          speech: yield* readPart(Speech, row.value.speech),
        } satisfies SavedSettings;
      }).pipe(
        Effect.provide(layer),
        Effect.orElseSucceed(() => noSettings),
      ),
    keepSettings: (accountId, machineId, settings) =>
      Effect.gen(function* () {
        const key = keyOf(accountId, machineId);
        const part =
          settings.speech === undefined
            ? {}
            : {
                speech:
                  settings.speech === null
                    ? null
                    : yield* Schema.encodeEffect(Speech)(settings.speech),
              };
        const row = yield* settingsRows.get({ key });
        if (row === null)
          return yield* settingsRows.insert({
            key,
            speech: null,
            ...part,
          });
        return yield* settingsRows.getAndUpdate({ key }, () => part, {
          retries: RETRIES,
        });
      }).pipe(
        Effect.retry({ times: RETRIES }),
        Effect.provide(layer),
        Effect.ignore,
      ),
  });

/** Each Account's list, and its Machines' settings, in this browser's IndexedDB. */
export const idb = Layer.unwrap(
  Effect.sync(() =>
    Layer.succeed(
      SavedMachines,
      make(
        IDB.make(table, {
          database: IDB.database({ databaseName: 'code:machines' }),
          mode: 'disposable',
        }).layer,
      ),
    ),
  ),
);

/** Each Account's list, and its Machines' settings, in memory, for a test. */
export const memory = () =>
  Layer.succeed(SavedMachines, make(Memory.make(table).layer));
