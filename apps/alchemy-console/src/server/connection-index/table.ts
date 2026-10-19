import { Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

/*
 * The connection index's one table, on the Worker's D1 database: which
 * user connected each GitHub App installation. `alchemy.run.ts` declares it
 * from this definition, so a deploy creates it and guards its shape; its
 * names are stored, so they never change.
 */

export const connectionIndexTable = StdTable.make('connection-index')
  .primary('pk', 'sk')
  .build();

/** One installation's owner. */
const ConnectionOwner = EntityESchema.make(
  'ConnectionOwner',
  'installationId',
  { userId: Schema.String },
).build();

export const connectionOwner = connectionIndexTable
  .entity(ConnectionOwner)
  .primary({ pk: [] })
  .build();
