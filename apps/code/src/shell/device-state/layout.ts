import { Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { EntityESchema, ESchema } from '@kestack/std-toolkit/eschema';

/*
 * How Device State is laid out, as one StdTable: one row for the keyboard,
 * Vim Mode and the user's own Bindings; one row per Unseen mark, each the
 * end time of the last Turn of a Session of one Machine seen on this
 * device; and one row per Account, the Machine it was last on here.
 *
 * The marks of before Machines (`UnseenMark`, by Session id alone) are no
 * longer read: no Machine can claim them.
 */

export const DEVICE_TABLE = 'device';

export const table = StdTable.make(DEVICE_TABLE).primary('pk', 'sk').build();

const KeyboardSchema = ESchema.make('DeviceKeyboard', {
  vim: Schema.Boolean,
  /** Each Action's own keys, by Action id, as people write them. */
  bindings: Schema.Record(Schema.String, Schema.Array(Schema.String)),
}).build();

export const keyboard = table
  .singleEntity(KeyboardSchema)
  .default({ vim: false, bindings: {} });

const MarkSchema = EntityESchema.make('MachineUnseenMark', 'mark', {
  machineId: Schema.String,
  sessionId: Schema.String,
  /** When the last Turn seen ended, in ms since the epoch; 0 before any. */
  seen: Schema.Finite,
}).build();

export type Mark = typeof MarkSchema.Type;

/** A mark's id: its Machine's and its Session's, which no id holds a space of. */
export const markOf = (machineId: string, sessionId: string) =>
  `${machineId} ${sessionId}`;

export const marks = table.entity(MarkSchema).primary().build();

const LastMachineSchema = EntityESchema.make('LastMachine', 'accountId', {
  machineId: Schema.String,
}).build();

export type LastMachine = typeof LastMachineSchema.Type;

export const lastMachines = table.entity(LastMachineSchema).primary().build();
