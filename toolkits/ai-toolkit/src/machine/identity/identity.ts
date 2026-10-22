import { hostname } from 'node:os';
import { Data, Effect } from 'effect';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';
import { newMachineId, newMachineKey } from './secrets.js';
import { type MachineRecord, machineTable, stored } from './table.js';

/*
 * Which Machine a database file is. One file is one Machine, signed in as
 * one User: the first `serve` makes the Machine, with a random id and Machine
 * Key and the host's name, and every later start on the file finds it again.
 * A different User signing in on the file is refused, and `logout` forgets
 * the Machine so the next start is a new one.
 */

/** The database file belongs to another User. */
export class MachineOwnedByAnother extends Data.TaggedError(
  'MachineOwnedByAnother',
)<{ readonly db: string; readonly owner: string; readonly user: string }> {
  override get message() {
    return `${this.db} is the Machine of ${this.owner}, not ${this.user}. Run with another --db, or run \`ai-toolkit logout\` on it first.`;
  }
}

/** Runs `use` against the Machine table on the SQLite file at `db`. */
const onFile = <A, E, R>(db: string, use: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => makeNodeSQLite({ path: db })),
    (database) =>
      SQLite.setup(machineTable, { database }).pipe(
        Effect.orDie,
        Effect.andThen(use),
        Effect.provide(SQLite.make(machineTable, { database }).layer),
      ),
    (database) => Effect.sync(() => database.close?.()),
  );

const read = stored.get().pipe(
  Effect.map(({ value }) => value.machine),
  Effect.orDie,
);

const write = (machine: MachineRecord | null) =>
  Effect.asVoid(stored.put({ machine })).pipe(Effect.orDie);

/**
 * The Machine the file at `db` is, for `owner`: made on first use, named
 * `name` when given (and kept), else the host's name. Fails when the file
 * belongs to another User.
 */
export const claim = (options: {
  readonly db: string;
  readonly owner: { readonly id: string; readonly email: string };
  readonly name?: string | undefined;
}) =>
  onFile(
    options.db,
    Effect.gen(function* () {
      const found = yield* read;
      if (found && found.owner.id !== options.owner.id)
        return yield* new MachineOwnedByAnother({
          db: options.db,
          owner: found.owner.email,
          user: options.owner.email,
        });
      const machine: MachineRecord = found
        ? { ...found, name: options.name ?? found.name }
        : {
            id: newMachineId(),
            name: options.name ?? hostname(),
            key: newMachineKey(),
            owner: options.owner,
          };
      if (JSON.stringify(machine) !== JSON.stringify(found))
        yield* write(machine);
      return { id: machine.id, name: machine.name, key: machine.key };
    }),
  );

/** Forgets the Machine the file at `db` was, so the next start makes a new one. */
export const forget = (db: string) => onFile(db, write(null));
