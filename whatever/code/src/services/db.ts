import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import envPaths from 'env-paths';
import { Context, Effect, Layer } from 'effect';

export const DEFAULT_DB_PATH = join(
  envPaths('whatever', { suffix: '' }).data,
  'whatever.sqlite',
);

export interface DbOptions {
  dbPath?: string;
}

export class Db extends Context.Service<Db, { database: DatabaseSync }>()(
  'code/Db',
) {}

export const makeDbLayer = (options: DbOptions = {}) =>
  Layer.effect(
    Db,
    Effect.acquireRelease(
      Effect.sync(() => {
        const dbPath = options.dbPath ?? DEFAULT_DB_PATH;
        if (dbPath !== ':memory:') {
          mkdirSync(dirname(dbPath), { recursive: true });
        }
        return new DatabaseSync(dbPath);
      }),
      (database) => Effect.sync(() => database.close()),
    ).pipe(Effect.map((database) => ({ database }))),
  );
