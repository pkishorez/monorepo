import { Effect } from 'effect';
import { SQLite } from '@kstackz/std-toolkit/db/sqlite';
import {
  type DurableObjectSQLiteStorage,
  makeDurableObjectSQLite,
} from '@kstackz/std-toolkit/db/sqlite/durable-object';
import { ledgerTable } from './table.ts';

/** The ledger table in one User's Durable Object: its own SQLite, set up
 * each time the object wakes (a no-op once the table is there). Partitioned
 * by user like D1's, though only one ever writes here. */
export const tableDurableObject = (storage: DurableObjectSQLiteStorage) => {
  const database = makeDurableObjectSQLite({ storage });
  Effect.runSync(SQLite.setup(ledgerTable, { database }));
  return SQLite.make(ledgerTable, { database }).layer;
};
