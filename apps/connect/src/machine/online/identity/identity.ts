import { hostname } from 'node:os';
import { Data, Effect } from 'effect';
import {
  type MachineRecord,
  readMachine,
  removeMachine,
  writeMachine,
} from './machine-file.js';
import { newMachineId, newMachineKey } from './secrets.js';

/*
 * Which Machine this Connect is. Its `machine.json` is one Machine, signed
 * in as one User: the first `serve` makes the Machine, with a random id and
 * Machine Key and the host's name (and the branch's, in development), and
 * every later start finds it again. The host's name is cut at its first
 * dot, so `Ada-MacBook.local` is `Ada-MacBook`; a name kept with the whole
 * of it takes the short one. A different User signing in is
 * refused, and `logout` forgets the Machine so the next start is a new one.
 */

/** This Machine belongs to another User. */
export class MachineOwnedByAnother extends Data.TaggedError(
  'MachineOwnedByAnother',
)<{ readonly file: string; readonly owner: string; readonly user: string }> {
  override get message() {
    return `${this.file} is the Machine of ${this.owner}, not ${this.user}. Run \`ke-connect logout\` first, or serve with another --branch.`;
  }
}

/** The host's name up to its first dot: `Ada-MacBook.local` is `Ada-MacBook`. */
export const hostName = () => hostname().split('.')[0] || hostname();

/** A name kept with the whole of the host's name, with the short one. */
const shortened = (name: string) =>
  hostName() === hostname() ? name : name.replaceAll(hostname(), hostName());

/** Where a Machine is kept. */
export interface Kept {
  /** Its machine.json. */
  readonly file: string;
}

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
    const found = yield* readMachine(options.file);
    if (found && found.owner.id !== options.owner.id)
      return yield* new MachineOwnedByAnother({
        file: options.file,
        owner: found.owner.email,
        user: options.owner.email,
      });
    // A Report carries at most 64 characters of name.
    const machine: MachineRecord = found
      ? {
          ...found,
          name: (options.name ?? shortened(found.name)).slice(0, 64),
        }
      : {
          id: newMachineId(),
          name: (options.name ?? options.firstName ?? hostName()).slice(0, 64),
          key: newMachineKey(),
          owner: options.owner,
        };
    if (JSON.stringify(machine) !== JSON.stringify(found))
      yield* writeMachine(options.file, machine);
    return { id: machine.id, name: machine.name, key: machine.key };
  });

/** The Machine kept, and its owner, without making one; null when there is none yet. */
export const found = (kept: Kept) => readMachine(kept.file);

/** Forgets the Machine kept, so the next start makes a new one. */
export const forget = (kept: Kept) => removeMachine(kept.file);
