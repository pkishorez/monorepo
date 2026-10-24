import { Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { EntityESchema, ESchema } from '@kestack/std-toolkit/eschema';

/*
 * How Device State is laid out, as one StdTable: one row for the keyboard,
 * the user's own Bindings; one for whether Vim Mode is on, off until it is
 * turned on; one for the microphone a Dictation records
 * from; one for the Machine the sidebar shows; one row per Unseen mark, each the
 * end time of the last Turn of a Session of one Machine seen on this
 * device; and one row per Pending Move, where a Session of one Machine
 * goes until its Machine confirms it.
 *
 * The marks of before Machines (`UnseenMark`, by Session id alone) are no
 * longer read: no Machine can claim them.
 */

export const DEVICE_TABLE = 'device';

export const table = StdTable.make(DEVICE_TABLE).primary('pk', 'sk').build();

const KeyboardSchema = ESchema.make('DeviceKeyboard', {
  /** Each Action's own keys, by Action id, as people write them. */
  bindings: Schema.Record(Schema.String, Schema.Array(Schema.String)),
}).build();

export const keyboard = table
  .singleEntity(KeyboardSchema)
  .default({ bindings: {} });

const VimSchema = ESchema.make('DeviceVim', {
  /** Whether Vim Mode is on: plain keys as shortcuts, and the Draft read until `i`. */
  on: Schema.Boolean,
}).build();

export const vim = table.singleEntity(VimSchema).default({ on: false });

const MicrophoneSchema = ESchema.make('DeviceMicrophone', {
  /** The audio input chosen, by the browser's `deviceId`; null for the system default. */
  deviceId: Schema.NullOr(Schema.String),
}).build();

export const microphone = table
  .singleEntity(MicrophoneSchema)
  .default({ deviceId: null });

const SidebarSchema = ESchema.make('DeviceSidebar', {
  /** The Machine whose Projects the sidebar lists; null for every Machine. */
  machineId: Schema.NullOr(Schema.String),
}).build();

export const sidebar = table
  .singleEntity(SidebarSchema)
  .default({ machineId: null });

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

const MoveSchema = EntityESchema.make('MachinePendingMove', 'move', {
  machineId: Schema.String,
  sessionId: Schema.String,
  /** Whether it goes Settled. */
  settled: Schema.Boolean,
}).build();

export type PendingMove = typeof MoveSchema.Type;

/** A Pending Move's id, as a mark's: its Machine's and its Session's. */
export const moveOf = markOf;

export const moves = table.entity(MoveSchema).primary().build();
