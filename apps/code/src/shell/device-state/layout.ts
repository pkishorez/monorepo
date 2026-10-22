import { Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { EntityESchema, ESchema } from '@kestack/std-toolkit/eschema';

/*
 * How Device State is laid out, as one StdTable: one row for the keyboard,
 * Vim Mode and the user's own Bindings, and one row per Unseen mark, each
 * the end time of the last Turn of a Session seen on this device.
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

const MarkSchema = EntityESchema.make('UnseenMark', 'sessionId', {
  /** When the last Turn seen ended, in ms since the epoch; 0 before any. */
  seen: Schema.Finite,
}).build();

export type Mark = typeof MarkSchema.Type;

export const marks = table.entity(MarkSchema).primary().build();
