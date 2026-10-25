import { existsSync } from 'node:fs';
import { Effect, Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';
import { ESchema } from '@kestack/std-toolkit/eschema';
import { MachineRecord } from './machine-file.js';

/*
 * Where ai-toolkit kept the one Machine a database file was: a table of
 * its own on the same SQLite file as the Store, holding a single record.
 * Connect keeps the Machine in machine.json instead; the first run on a
 * database moved from ~/.ai-toolkit reads the record here once, keeps it,
 * and only then nulls it, so the Machine keeps its id and Machine Key even
 * when the first run is cut short. The names are what is stored and never
 * change.
 */

const Stored = ESchema.make('Machine', {
  machine: Schema.NullOr(MachineRecord),
}).build();

const LEGACY_TABLE = 'ai-toolkit-machine';

const machineTable = StdTable.make(LEGACY_TABLE).primary('pk', 'sk').build();

const stored = machineTable.singleEntity(Stored).default({ machine: null });

/**
 * The Machine the database at `db` was under ai-toolkit, handed to `keep`
 * and nulled there once kept; null when it holds none, or has no such
 * table.
 */
export const takeLegacyMachine = (
  db: string,
  keep: (machine: MachineRecord) => Effect.Effect<void>,
) =>
  Effect.acquireUseRelease(
    Effect.sync(() => (existsSync(db) ? makeNodeSQLite({ path: db }) : null)),
    (database) =>
      database === null
        ? Effect.succeed(null)
        : Effect.gen(function* () {
            const tables = yield* database.all(
              "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
              [LEGACY_TABLE],
            );
            if (tables.length === 0) return null;
            const { value } = yield* stored.get();
            if (value.machine === null) return null;
            yield* keep(value.machine);
            yield* stored.put({ machine: null });
            return value.machine;
          }).pipe(
            Effect.orDie,
            Effect.provide(SQLite.make(machineTable, { database }).layer),
          ),
    (database) => Effect.sync(() => database?.close?.()),
  );

/**
 * Nulls the Machine ai-toolkit kept in the database at `db`, if it still
 * holds one: once machine.json holds the Machine, a take cut short before
 * it nulled the record must not leave it to be taken again.
 */
export const clearLegacyMachine = (db: string) =>
  takeLegacyMachine(db, () => Effect.void);
