import { Context, Effect, Layer, Semaphore, Stream } from 'effect';
import { defaultBroadcaster, type Entity } from '@kestack/std-toolkit/core';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import {
  makeDurableObjectSQLite,
  type DurableObjectSQLiteStorage,
} from '@kestack/std-toolkit/db/sqlite/durable-object';
import type { Member } from '../../../../shared/contracts/member/index.ts';
import {
  credential,
  gitHubConnection,
  installState,
  owner,
  type StoredConnection,
  type StoredCredential,
  type StoredInstallState,
  userSpaceTable,
} from './table.ts';
import { makeRuns, type Runs } from './runs.ts';

/*
 * The User Space's records, on its Durable Object's SQLite: typed reads,
 * writes and subscriptions for the workflows. Every write is heard by every
 * subscription in this object, so a change reaches each of the user's open
 * tabs. A storage failure inside the user's own object is a defect.
 */

const sameMember = (a: Member | null, b: Member | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.userId === b.userId &&
    a.email === b.email &&
    a.name === b.name);

export class Storage extends Context.Service<
  Storage,
  {
    /** Who this User Space belongs to. */
    readonly owner: {
      /** As last recorded; null before their first call. */
      readonly get: Effect.Effect<Member | null>;
      /** Records them as verified at `at`, unless a later verification
       * is recorded, telling every subscription if anything changed;
       * answers who is recorded after. */
      readonly put: (member: Member, at: number) => Effect.Effect<Member>;
      /** As recorded now, then each time it changes. */
      readonly changes: Stream.Stream<Member | null>;
    };
    /** The owner's Provider credentials, oldest first; secrets only sealed. */
    readonly credentials: {
      /** Runs `effect` with no other `exclusively` effect in between, as a
       * check for a taken name and the write it guards must run. */
      readonly exclusively: <A, E, R>(
        effect: Effect.Effect<A, E, R>,
      ) => Effect.Effect<A, E, R>;
      readonly all: Effect.Effect<ReadonlyArray<StoredCredential>>;
      /** All of them now, then again after each change. */
      readonly changes: Stream.Stream<ReadonlyArray<StoredCredential>>;
      readonly get: (
        credentialId: string,
      ) => Effect.Effect<StoredCredential | null>;
      readonly insert: (
        record: StoredCredential,
      ) => Effect.Effect<StoredCredential>;
      /** Renames it at `at`; null when there is no such credential. */
      readonly rename: (
        credentialId: string,
        name: string,
        at: number,
      ) => Effect.Effect<StoredCredential | null>;
      /** Erases it, sealed secret and all; false when there was none. */
      readonly remove: (credentialId: string) => Effect.Effect<boolean>;
    };
    /** The owner's GitHub connections, oldest first. */
    readonly connections: {
      /** Runs `effect` with no other `exclusively` effect in between, so
       * two writes for one installation never make two connections. */
      readonly exclusively: <A, E, R>(
        effect: Effect.Effect<A, E, R>,
      ) => Effect.Effect<A, E, R>;
      readonly all: Effect.Effect<ReadonlyArray<StoredConnection>>;
      /** All of them now, then again after each change. */
      readonly changes: Stream.Stream<ReadonlyArray<StoredConnection>>;
      readonly get: (
        connectionId: string,
      ) => Effect.Effect<StoredConnection | null>;
      readonly byInstallation: (
        installationId: number,
      ) => Effect.Effect<StoredConnection | null>;
      /** Keeps `record`, over any connection of the same ID. */
      readonly put: (
        record: StoredConnection,
      ) => Effect.Effect<StoredConnection>;
      /** False when there was none. */
      readonly remove: (connectionId: string) => Effect.Effect<boolean>;
    };
    /** The owner's runs, their events and log batches, and the lanes they take turns in. */
    readonly runs: Runs;
    /** The one-time states of install URLs not yet come back. */
    readonly installStates: {
      readonly issue: (record: StoredInstallState) => Effect.Effect<void>;
      /** The state, used up: null when it was never issued or was taken already. */
      readonly take: (
        state: string,
      ) => Effect.Effect<StoredInstallState | null>;
      /** Erases every state issued before `before`. */
      readonly sweep: (before: number) => Effect.Effect<void>;
    };
  }
>()('alchemy-console/UserSpace/Storage') {
  /** The Storage of the Durable Object whose `storage` this is; its table is made on first use. */
  static readonly layer = (storage: DurableObjectSQLiteStorage) =>
    Layer.effect(
      Storage,
      Effect.gen(function* () {
        const database = makeDurableObjectSQLite({ storage });
        yield* SQLite.setup(userSpaceTable, { database }).pipe(Effect.orDie);
        const table = yield* Layer.build(
          Layer.merge(
            SQLite.make(userSpaceTable, { database }).layer,
            defaultBroadcaster,
          ),
        );
        const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
          effect.pipe(Effect.provideContext(table), Effect.orDie);

        const lock = yield* Semaphore.make(1);
        const read = run(owner.get()).pipe(Effect.map(({ value }) => value));
        const get = Effect.map(read, ({ member }) => member);

        /** Every record of one entity, page by page, oldest first. */
        const everyPage = <T, E>(
          page: (after: Entity<T> | undefined) => Effect.Effect<
            {
              readonly items: ReadonlyArray<Entity<T>>;
              readonly hasMore: boolean;
            },
            E,
            never
          >,
        ) =>
          Effect.gen(function* () {
            const found: Array<T> = [];
            let after: Entity<T> | undefined;
            while (true) {
              const next = yield* page(after).pipe(Effect.orDie);
              found.push(...next.items.map(({ value }) => value));
              after = next.items.at(-1);
              if (!next.hasMore || after === undefined) return found;
            }
          });
        const everyFrom = { pk: {}, '>=': null } as const;
        const paged = <T>(after: Entity<T> | undefined) => ({
          excludeDeleted: true,
          ...(after ? { after } : {}),
        });

        const all = everyPage<StoredCredential, never>((after) =>
          run(credential.query('primary', everyFrom, paged(after))),
        );

        const connectionLock = yield* Semaphore.make(1);
        const connections = everyPage<StoredConnection, never>((after) =>
          run(gitHubConnection.query('primary', everyFrom, paged(after))),
        );
        const states = everyPage<StoredInstallState, never>((after) =>
          run(installState.query('primary', everyFrom, paged(after))),
        );
        const dropState = (state: string) =>
          run(installState.hardDelete({ state }, 'I KNOW WHAT I AM DOING'));

        const runs = yield* makeRuns(
          run as <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A>,
          table as never,
        );

        return Storage.of({
          runs,
          owner: {
            get,
            put: (member, at) =>
              Effect.gen(function* () {
                const current = yield* read;
                if (current.member !== null && current.at > at)
                  return current.member;
                // A newer word moves `at` on even when the member is the
                // same, so an older one can never undo it.
                if (current.member === null || at > current.at)
                  yield* run(owner.put({ member, at }));
                return member;
              }),
            changes: Stream.concat(
              Stream.fromEffect(get),
              owner.subscribe().pipe(
                Stream.map(({ value }) => value.member),
                Stream.provideContext(table),
              ),
            ).pipe(Stream.changesWith(sameMember)),
          },
          credentials: {
            exclusively: (effect) => Semaphore.withPermit(lock, effect),
            all,
            changes: Stream.concat(
              Stream.fromEffect(all),
              credential.subscribe().pipe(
                Stream.provideContext(table),
                Stream.mapEffect(() => all),
              ),
            ),
            get: (credentialId) =>
              run(
                credential.get({ credentialId }, { excludeDeleted: true }),
              ).pipe(Effect.map((found) => found?.value ?? null)),
            insert: (record) =>
              run(credential.insert(record)).pipe(
                Effect.map(({ value }) => value),
              ),
            rename: (credentialId, name, at) =>
              Effect.gen(function* () {
                const found = yield* run(
                  credential.get({ credentialId }, { excludeDeleted: true }),
                );
                if (found === null) return null;
                const renamed = yield* run(
                  credential.getAndUpdate(
                    { credentialId },
                    { name, updatedAt: at },
                  ),
                );
                return renamed.value;
              }),
            remove: (credentialId) =>
              Effect.gen(function* () {
                const found = yield* run(credential.get({ credentialId }));
                if (found === null) return false;
                yield* run(
                  credential.hardDelete(
                    { credentialId },
                    'I KNOW WHAT I AM DOING',
                  ),
                );
                return true;
              }),
          },
          connections: {
            exclusively: (effect) =>
              Semaphore.withPermit(connectionLock, effect),
            all: connections,
            changes: Stream.concat(
              Stream.fromEffect(connections),
              gitHubConnection.subscribe().pipe(
                Stream.provideContext(table),
                Stream.mapEffect(() => connections),
              ),
            ),
            get: (connectionId) =>
              run(
                gitHubConnection.get(
                  { connectionId },
                  { excludeDeleted: true },
                ),
              ).pipe(Effect.map((found) => found?.value ?? null)),
            byInstallation: (installationId) =>
              Effect.map(
                connections,
                (all) =>
                  all.find((each) => each.installationId === installationId) ??
                  null,
              ),
            put: (record) =>
              Effect.gen(function* () {
                const { connectionId, ...fields } = record;
                const found = yield* run(
                  gitHubConnection.get({ connectionId }),
                );
                const saved =
                  found === null
                    ? yield* run(gitHubConnection.insert(record))
                    : yield* run(
                        gitHubConnection.getAndUpdate({ connectionId }, fields),
                      );
                return saved.value;
              }),
            remove: (connectionId) =>
              Effect.gen(function* () {
                const found = yield* run(
                  gitHubConnection.get({ connectionId }),
                );
                if (found === null) return false;
                yield* run(
                  gitHubConnection.hardDelete(
                    { connectionId },
                    'I KNOW WHAT I AM DOING',
                  ),
                );
                return true;
              }),
          },
          installStates: {
            issue: (record) => Effect.asVoid(run(installState.insert(record))),
            take: (state) =>
              Effect.gen(function* () {
                const found = yield* run(installState.get({ state }));
                if (found === null) return null;
                yield* dropState(state);
                return found.value;
              }),
            sweep: (before) =>
              Effect.gen(function* () {
                for (const { state, issuedAt } of yield* states)
                  if (issuedAt < before) yield* dropState(state);
              }),
          },
        });
      }),
    );
}
