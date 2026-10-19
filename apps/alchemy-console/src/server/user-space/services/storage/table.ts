import { Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { ESchema } from '@kestack/std-toolkit/eschema';
import { Member } from '../../../../shared/contracts/member/index.ts';

/*
 * The one table every User Space keeps on its own SQLite: a user's records
 * live only in their own Durable Object. Each entity is defined here, beside
 * the table, and its names are stored, so they never change.
 */

export const userSpaceTable = StdTable.make('user-space')
  .primary('pk', 'sk')
  .build();

/** Who this User Space belongs to, as last verified: unknown until their first call. */
const Owner = ESchema.make('Owner', {
  member: Schema.NullOr(Member),
  /** When the Worker verified them so, in milliseconds since the epoch. */
  at: Schema.Number,
}).build();

export const owner = userSpaceTable
  .singleEntity(Owner)
  .default({ member: null, at: 0 });
