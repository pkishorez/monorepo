import { hostname } from 'node:os';
import { Data, Effect } from 'effect';
import {
  type MachineRecord,
  readMachine,
  removeMachine,
  writeMachine,
} from './machine-file.js';
import { clearLegacyMachine, takeLegacyMachine } from './legacy.js';
import { newMachineId, newMachineKey } from './secrets.js';

/*
 * Which Machine this Connect is. Its `machine.json` is one Machine, signed
 * in as one User: the first `serve` makes the Machine, with a random id and
 * Machine Key and the host's name (and the branch's, in development), and
 * every later start finds it again. A different User signing in is
 * refused, and `logout` forgets the Machine so the next start is a new one.
 *
 * A database moved from ~/.ai-toolkit still holds its Machine in
 * ai-toolkit's table: while there is no machine.json, that record becomes
 * it, so the Machine keeps its id and Machine Key. Once there is one,
 * the record is cleared on every start, should a first start have been
 * cut short between the two, so `logout` never brings the old Machine back.
 */

/** This Machine belongs to another User. */
export class MachineOwnedByAnother extends Data.TaggedError(
  'MachineOwnedByAnother',
)<{ readonly file: string; readonly owner: string; readonly user: string }> {
  override get message() {
    return `${this.file} is the Machine of ${this.owner}, not ${this.user}. Run \`ke-connect logout\` first, or serve with another --branch.`;
  }
}

/** Where a Machine is kept. */
export interface Kept {
  /** Its machine.json. */
  readonly file: string;
  /** The database, which may hold the Machine ai-toolkit kept. */
  readonly db: string;
}

/**
 * The Machine kept, taking ai-toolkit's over first when there is no
 * machine.json yet, written before it is cleared there, and clearing it
 * there when machine.json already holds one; null when there is none.
 */
const current = (kept: Kept) =>
  Effect.gen(function* () {
    const found = yield* readMachine(kept.file);
    if (found !== null) {
      yield* clearLegacyMachine(kept.db);
      return found;
    }
    const legacy = yield* takeLegacyMachine(kept.db, (machine) =>
      writeMachine(kept.file, machine),
    );
    if (legacy === null) return null;
    yield* Effect.log(
      `Moved Machine ${legacy.name} (${legacy.id}) to ${kept.file}`,
    );
    return legacy;
  });

/**
 * The Machine kept, for `owner`: made on first use, named `name` when
 * given (and kept), else `firstName`, else the host's name. Fails when it
 * belongs to another User.
 */
export const claim = (
  options: Kept & {
    readonly owner: { readonly id: string; readonly email: string };
    readonly name?: string | undefined;
    readonly firstName?: string | undefined;
  },
) =>
  Effect.gen(function* () {
    const found = yield* current(options);
    if (found && found.owner.id !== options.owner.id)
      return yield* new MachineOwnedByAnother({
        file: options.file,
        owner: found.owner.email,
        user: options.owner.email,
      });
    // A Report carries at most 64 characters of name.
    const machine: MachineRecord = found
      ? { ...found, name: (options.name ?? found.name).slice(0, 64) }
      : {
          id: newMachineId(),
          name: (options.name ?? options.firstName ?? hostname()).slice(0, 64),
          key: newMachineKey(),
          owner: options.owner,
        };
    if (JSON.stringify(machine) !== JSON.stringify(found))
      yield* writeMachine(options.file, machine);
    return { id: machine.id, name: machine.name, key: machine.key };
  });

/** The Machine kept, and its owner, without making one; null when there is none yet. */
export const found = current;

/** Forgets the Machine kept, ai-toolkit's record of it included, so the next start makes a new one. */
export const forget = (kept: Kept) =>
  Effect.andThen(current(kept), removeMachine(kept.file));
