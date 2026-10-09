import { SQLite } from '@kstackz/std-toolkit/db/sqlite';
import {
  type D1SQLiteConfig,
  type D1Statement,
  makeD1SQLite,
} from '@kstackz/std-toolkit/db/sqlite/d1';
import { ledgerTable } from './table.ts';

/** The ledger table in the cloud: the Worker's D1 database, as its `env`
 * binds it. */
export const tableCloud = <Statement extends D1Statement<Statement>>(
  binding: D1SQLiteConfig<Statement>['database'],
) =>
  SQLite.make(ledgerTable, {
    database: makeD1SQLite({ database: binding }),
  }).layer;
