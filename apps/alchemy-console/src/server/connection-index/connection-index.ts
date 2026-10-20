import { Context, Effect, Layer } from 'effect';
import { defaultBroadcaster } from '@kestack/std-toolkit/core';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import {
  type D1SQLiteConfig,
  type D1Statement,
  makeD1SQLite,
} from '@kestack/std-toolkit/db/sqlite/d1';
import { connectionIndexTable, connectionOwner } from './table.ts';

/*
 * The connection index: which user owns each GitHub App installation, the
 * one fact about a user Console keeps outside their User Space, so a
 * webhook, which names only an installation, reaches the right one.
 *
 * An installation has at most one owner. `claim` takes it only while no one
 * holds it (D1 refuses a second insert of the same key), and `release`
 * gives it up only for the user who holds it. Each User Space writes its
 * own rows; the Worker only reads them. A D1 failure is a defect.
 */

export class ConnectionIndex extends Context.Service<
  ConnectionIndex,
  {
    /** Who owns `installationId`; null when no one does. */
    readonly owner: (installationId: number) => Effect.Effect<string | null>;
    /** Records `userId` as its owner unless someone else already is;
     * answers whether `userId` owns it after. */
    readonly claim: (
      installationId: number,
      userId: string,
    ) => Effect.Effect<boolean>;
    /** Forgets its owner, when that is `userId`. */
    readonly release: (
      installationId: number,
      userId: string,
    ) => Effect.Effect<void>;
  }
>()('alchemy-console/ConnectionIndex') {
  /** The index on `database`, the Worker's `CONSOLE_INDEX` binding. */
  static readonly make = <S extends D1Statement<S>>(
    database: D1SQLiteConfig<S>['database'],
  ): ConnectionIndex['Service'] => {
    const table = SQLite.make(connectionIndexTable, {
      database: makeD1SQLite({ database }),
    }).layer.pipe(Layer.provideMerge(defaultBroadcaster));
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(Effect.provide(table), Effect.orDie) as Effect.Effect<A>;
    const owner = (installationId: number) =>
      run(connectionOwner.get({ installationId: String(installationId) })).pipe(
        Effect.map((found) => found?.value.userId ?? null),
      );
    return {
      owner,
      claim: (installationId, userId) =>
        Effect.gen(function* () {
          const current = yield* owner(installationId);
          if (current !== null) return current === userId;
          const inserted = yield* connectionOwner
            .insert({ installationId: String(installationId), userId })
            .pipe(Effect.provide(table), Effect.result);
          // Someone else may have claimed it in between: theirs stands.
          if (inserted._tag === 'Failure')
            return (yield* owner(installationId)) === userId;
          return true;
        }),
      release: (installationId, userId) =>
        Effect.gen(function* () {
          if ((yield* owner(installationId)) !== userId) return;
          yield* run(
            connectionOwner.hardDelete(
              { installationId: String(installationId) },
              'I KNOW WHAT I AM DOING',
            ),
          );
        }),
    };
  };

  static readonly layer = <S extends D1Statement<S>>(
    database: D1SQLiteConfig<S>['database'],
  ) => Layer.succeed(ConnectionIndex, ConnectionIndex.make(database));
}
