import { Context, Effect, Layer, Schema } from 'effect';
import { Machine as MachineSchema } from '@kestack/ai-toolkit/machines';
import { StdTable, type StdTableService } from '@kestack/std-toolkit/db';
import { IDB } from '@kestack/std-toolkit/db/idb';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

/*
 * The last list of Machines each Account was given here, in this browser's
 * IndexedDB, so the app opens on the last Machine even while the Backend
 * is out of reach. One row per Account; an Account signed out keeps an
 * empty list. Nothing here is the truth: the Backend's next answer
 * replaces it.
 */

// Kept as the list's JSON: a Machine's numbers are plain `Schema.Number`,
// which an ESchema refuses to keep as a field.
const SavedSchema = EntityESchema.make('SavedMachines', 'accountId', {
  machines: Schema.String,
}).build();

const List = Schema.fromJsonString(Schema.Array(MachineSchema));
const decode = Schema.decodeUnknownEffect(List);
const encode = Schema.encodeEffect(List);

const TABLE = 'machines';

const table = StdTable.make(TABLE).primary('pk', 'sk').build();

const rows = table.entity(SavedSchema).primary().build();

const RETRIES = 5;

type Machine = typeof MachineSchema.Type;

/** The Capability that keeps each Account's last list. */
export class Saved extends Context.Service<
  Saved,
  {
    /** The list last kept for the Account; null if none was. */
    readonly read: (
      accountId: string,
    ) => Effect.Effect<ReadonlyArray<Machine> | null>;
    readonly write: (
      accountId: string,
      machines: ReadonlyArray<Machine>,
    ) => Effect.Effect<void>;
  }
>()('code/SavedMachines') {}

const make = (layer: Layer.Layer<StdTableService<typeof TABLE>>) =>
  Saved.of({
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
  });

/** Each Account's list in this browser's IndexedDB. */
export const idb = Layer.unwrap(
  Effect.sync(() =>
    Layer.succeed(
      Saved,
      make(
        IDB.make(table, {
          database: IDB.database({ databaseName: 'code:machines' }),
        }).layer,
      ),
    ),
  ),
);

/** Each Account's list in memory, for a test. */
export const memory = () =>
  Layer.succeed(Saved, make(Memory.make(table).layer));
