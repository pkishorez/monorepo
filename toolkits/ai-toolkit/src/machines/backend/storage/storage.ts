import { Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

/*
 * Where the Machines Backend keeps its records: one std Table, `machines`,
 * on the Backend's D1 database. A Machine id is one Machine's alone, across
 * every User, so each Machine is its own partition, keyed by its id; its
 * owner's Machines are found through `byOwner`. A forgotten Machine stays
 * as a tombstone, with `forgottenAt` set and the Sign-in it last reported
 * with (ADR 0016).
 */

/**
 * One Machine as stored: its last Report (see `MachineReport`), its owner,
 * Last Seen, and whether it was forgotten. Its own fields, not the
 * contract's, so a change to the contract never silently changes the rows.
 */
export const MachineRecord = EntityESchema.make('Machine', 'id', {
  name: Schema.String,
  url: Schema.NullOr(Schema.String),
  key: Schema.String,
  version: Schema.String,
  tunnel: Schema.NullOr(
    Schema.Struct({
      ok: Schema.Boolean,
      at: Schema.Finite,
      problem: Schema.NullOr(Schema.String),
    }),
  ),
  /** The User it reports as. */
  userId: Schema.String,
  /** Its Last Seen, epoch ms, by the Backend's clock. */
  lastSeen: Schema.Finite,
  /** The Sign-in it last reported with; null when that was an Access Token. */
  signInId: Schema.NullOr(Schema.String),
  /** When its User forgot it, epoch ms; null while it is not forgotten. */
  forgottenAt: Schema.NullOr(Schema.Finite),
}).build();

export type MachineRecord = typeof MachineRecord.Type;

/** The Machines Backend's table, for `SQLite.setup`, `D1.table` and the snapshot guard. */
export const machinesTable = StdTable.make('machines')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

export const machines = machinesTable
  .entity(MachineRecord)
  .primary({ pk: ['id'] })
  .index('GSI1', 'byOwner', { pk: ['userId'], sk: ['id'] })
  .build();
