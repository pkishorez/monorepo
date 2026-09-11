import { Context, Effect, Layer } from 'effect';
import type { SQLiteDriver } from 'std-toolkit/db/sqlite';

export class DeletionLock extends Context.Service<
  DeletionLock,
  {
    acquire: (key: string, owner: string) => Effect.Effect<boolean, unknown>;
    release: (key: string, owner: string) => Effect.Effect<void, unknown>;
  }
>()('alchemy-console/DeletionLock') {}

// Shared by all console Worker instances. A crashed request's lease expires;
// the native operation has a shorter 15-minute execution deadline.
export const makeDeletionLock = (database: SQLiteDriver) => ({
  setup: database.run(
    'CREATE TABLE IF NOT EXISTS alchemy_stage_deletion_lock (target TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL)',
  ),
  layer: Layer.succeed(DeletionLock, {
    acquire: (key, owner) =>
      database
        .run(
          'INSERT INTO alchemy_stage_deletion_lock (target, owner, expires_at) VALUES (?, ?, ?) ON CONFLICT(target) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at WHERE alchemy_stage_deletion_lock.expires_at < ?',
          [key, owner, Date.now() + 16 * 60_000, Date.now()],
        )
        .pipe(Effect.map((result) => result.changes === 1)),
    release: (key, owner) =>
      database
        .run(
          'DELETE FROM alchemy_stage_deletion_lock WHERE target = ? AND owner = ?',
          [key, owner],
        )
        .pipe(Effect.asVoid),
  }),
});
