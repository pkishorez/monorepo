import { Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { ESchema } from '@kestack/std-toolkit/eschema';

/*
 * Where a database file keeps the one Machine it is: a table of its own on
 * the same SQLite file as the Store, holding a single record, null until the
 * first `serve` makes it and again after `logout` forgets it.
 */

export const MachineRecord = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  /** The Machine Key (ADR 0015): made once, never changed. */
  key: Schema.String,
  /** The User this file belongs to. */
  owner: Schema.Struct({ id: Schema.String, email: Schema.String }),
});
export type MachineRecord = typeof MachineRecord.Type;

const Stored = ESchema.make('Machine', {
  machine: Schema.NullOr(MachineRecord),
}).build();

export const machineTable = StdTable.make('ai-toolkit-machine')
  .primary('pk', 'sk')
  .build();

export const stored = machineTable
  .singleEntity(Stored)
  .default({ machine: null });
