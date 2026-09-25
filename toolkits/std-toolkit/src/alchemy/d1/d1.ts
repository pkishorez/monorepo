import { Effect } from 'effect';
import { Action } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import type { DeployableTable } from '../snapshot-guard/index.js';
import { SQLite } from '../../db/sqlite/index.js';
import { makeD1SQLite } from '../../db/sqlite/drivers/d1/index.js';
import { guardTable } from '../snapshot-guard/index.js';

export interface D1TableOptions {
  readonly table: DeployableTable;
  readonly database: Cloudflare.D1.Database;
  /** Physical table name inside the database. Defaults to the logical name. */
  readonly tableName?: string;
}

/**
 * Deploys a StdTable on a Cloudflare D1 database: the snapshot guard keyed
 * to the database id, then a setup action that creates the physical table
 * and reconciles its indexes through the SQLite adapter. The action re-runs
 * whenever the accepted snapshot changes, and never before the guard has
 * accepted it.
 */
const table = (id: string, options: D1TableOptions) =>
  Effect.gen(function* () {
    const guard = yield* guardTable(`${id}Snapshot`, {
      table: options.table,
      target: options.database.databaseId,
    });
    const Setup = Action(
      'StdToolkit.D1.TableSetup',
      Effect.gen(function* () {
        const query = yield* Cloudflare.D1.QueryDatabase(options.database);
        return Effect.fn(function* (_input: { readonly snapshot: unknown }) {
          const database = makeD1SQLite({ database: yield* query.raw });
          yield* SQLite.setup(options.table, {
            database,
            ...(options.tableName === undefined
              ? {}
              : { tableName: options.tableName }),
          });
        });
      }).pipe(Effect.provide(Cloudflare.D1.QueryDatabaseLocal)),
    );
    yield* Setup(id, { snapshot: guard.snapshot });
  });

export const D1 = { table } as const;
