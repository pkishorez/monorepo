import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { Effect, Schema } from 'effect';

/*
 * Where a Machine keeps itself: `machine.json` in Connect's data folder,
 * holding its id, name, Machine Key and owner. It is the Machine Key's
 * one copy on disk, so it is written 0600, through a temporary file
 * renamed over it, so a write cut short never leaves half a Machine.
 */

export const MachineRecord = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  /** The Machine Key (ADR 0015): made once, never changed. */
  key: Schema.String,
  /** The User this Machine belongs to. */
  owner: Schema.Struct({ id: Schema.String, email: Schema.String }),
});
export type MachineRecord = typeof MachineRecord.Type;

const decode = Schema.decodeUnknownSync(Schema.fromJsonString(MachineRecord));

/** The Machine kept at `file`; null when there is none. */
export const readMachine = (file: string) =>
  Effect.sync(() =>
    existsSync(file) ? decode(readFileSync(file, 'utf8')) : null,
  );

/** Keeps `machine` at `file`, 0600, replacing whatever was there whole. */
export const writeMachine = (file: string, machine: MachineRecord) =>
  Effect.sync(() => {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(machine, null, 2)}\n`, {
      mode: 0o600,
    });
    chmodSync(temporary, 0o600);
    renameSync(temporary, file);
  });

/** Forgets the Machine kept at `file`. */
export const removeMachine = (file: string) =>
  Effect.sync(() => rmSync(file, { force: true }));
