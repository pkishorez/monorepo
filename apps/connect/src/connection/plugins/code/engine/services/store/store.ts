import { Effect, Layer, PubSub, Semaphore, Stream } from 'effect';
import { Broadcaster, type Entity } from '@kestack/std-toolkit/core';
import type { StdTableService } from '@kestack/std-toolkit/db';
import type { Raw } from '@kestack/ai-toolkit/contract';
import type {
  HarnessAccountRecord,
  Project,
  Session,
} from '../../../records/index.js';
import {
  Store,
  type Feed,
  type StoreService,
} from '../../capabilities/index.js';
import { harnessAccounts, projects, raws, sessions } from './table.js';

/*
 * The one place records are kept: Raw, Projects, Sessions and Harness
 * Accounts in one table, `aiTable`, on any driver: SQLite on a computer
 * (engine/node.ts), memory or IndexedDB in a browser tab. The table comes
 * set up. Every write goes through one permit, so writes land in `_u` order
 * and a reader that has seen a `_u` has seen everything older. Every write
 * is also published in this process, so a reader can subscribe before it
 * catches up and miss nothing in between.
 */

const PAGE = 200;

const same = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

/** `aiTable` on a driver, set up: what the Store keeps its records in. */
export type StoreTable = Layer.Layer<StdTableService<'ai-toolkit'>>;

/** The table's storage, and the Broadcaster its writes publish to. */
const storage = (table: StoreTable, pubsub: PubSub.PubSub<Entity<unknown>>) => {
  const broadcaster = Layer.succeed(Broadcaster, {
    broadcast: (values) => {
      for (const value of values) PubSub.publishUnsafe(pubsub, value);
    },
    changes: Stream.fromPubSub(pubsub),
  });
  return Layer.merge(table, broadcaster);
};

type Storage = Layer.Success<ReturnType<typeof storage>>;

const make = (table: StoreTable) =>
  Effect.gen(function* () {
    const pubsub = yield* Effect.acquireRelease(
      PubSub.unbounded<Entity<unknown>>(),
      PubSub.shutdown,
    );
    const context = yield* Layer.build(storage(table, pubsub));
    const permit = yield* Semaphore.make(1);
    const run = <A, E>(
      effect: Effect.Effect<A, E, Storage>,
    ): Effect.Effect<A> =>
      effect.pipe(Effect.provideContext(context), Effect.orDie);
    const write = <A, E>(effect: Effect.Effect<A, E, Storage>) =>
      permit.withPermits(1)(run(effect));

    const changesOf = <T>(
      name: string,
      keep: (value: T) => boolean = () => true,
    ) =>
      Effect.map(PubSub.subscribe(pubsub), (subscription) =>
        Stream.fromSubscription(subscription).pipe(
          Stream.filter(
            (entity): entity is Entity<T> =>
              entity.meta._e === name && keep(entity.value as T),
          ),
        ),
      );

    const allOf = <T>(feed: Feed<T>) =>
      Effect.gen(function* () {
        const all: Array<T> = [];
        let cursor: string | null = null;
        while (true) {
          const page: {
            readonly items: ReadonlyArray<Entity<T>>;
            readonly hasMore: boolean;
          } = yield* feed.after(cursor, PAGE);
          for (const entity of page.items)
            if (!entity.meta._d) all.push(entity.value);
          if (!page.hasMore || page.items.length === 0) return all;
          cursor = page.items.at(-1)!.meta._u;
        }
      });

    const projectFeed: Feed<Project> = {
      after: (cursor, limit = PAGE) =>
        run(
          projects.query(
            'byUpdate',
            cursor === null
              ? { pk: {}, '>=': null }
              : { pk: {}, '>': { _u: cursor } },
            { limit },
          ),
        ),
      changes: changesOf<Project>(projects.name),
    };

    const sessionFeed: Feed<Session> = {
      after: (cursor, limit = PAGE) =>
        run(
          sessions.query(
            'byUpdate',
            cursor === null
              ? { pk: {}, '>=': null }
              : { pk: {}, '>': { _u: cursor } },
            { limit },
          ),
        ),
      changes: changesOf<Session>(sessions.name),
    };

    const removeSession = (id: string) =>
      Effect.gen(function* () {
        const found = yield* sessions.get({ id }, { excludeDeleted: true });
        if (found === null) return false;
        yield* sessions.delete({ id });
        return true;
      });

    const service: StoreService = {
      appendRaw: (raw) => write(raws.insert(raw)),
      raws: (sessionId) => ({
        after: (cursor, limit = PAGE) =>
          run(
            raws.query(
              'bySession',
              cursor === null
                ? { pk: { sessionId }, '>=': null }
                : { pk: { sessionId }, '>': { _u: cursor } },
              { limit },
            ),
          ),
        changes: changesOf<Raw>(
          raws.name,
          (raw) => raw.sessionId === sessionId,
        ),
      }),
      // Read back from the newest until the Turn before it, as a Session
      // runs one Turn at a time.
      lastTurn: (sessionId) =>
        Effect.gen(function* () {
          const turn: Array<Raw> = [];
          let cursor: string | null = null;
          while (true) {
            const page: {
              readonly items: ReadonlyArray<Entity<Raw>>;
              readonly hasMore: boolean;
            } = yield* run(
              raws.query(
                'bySession',
                cursor === null
                  ? { pk: { sessionId }, '<=': null }
                  : { pk: { sessionId }, '<': { _u: cursor } },
                { limit: PAGE },
              ),
            );
            for (const { value } of page.items) {
              if (turn.length > 0 && value.turnId !== turn[0]!.turnId)
                return turn.reverse();
              turn.push(value);
            }
            if (!page.hasMore || page.items.length === 0) return turn.reverse();
            cursor = page.items.at(-1)!.meta._u;
          }
        }),
      projects: projectFeed,
      sessions: sessionFeed,
      project: (id) =>
        run(projects.get({ id }, { excludeDeleted: true })).pipe(
          Effect.map((found) => found?.value ?? null),
        ),
      allProjects: allOf(projectFeed),
      saveProject: (project) =>
        write(
          Effect.gen(function* () {
            const found = yield* projects.get({ id: project.id });
            if (found === null) yield* projects.insert(project);
            else if (!found.meta._d && !same(found.value, project))
              yield* projects.getAndUpdate({ id: project.id }, project);
          }),
        ),
      removeProject: (id) =>
        write(
          Effect.gen(function* () {
            const found = yield* projects.get({ id }, { excludeDeleted: true });
            if (found === null) return false;
            // The Project first: a stop between the two leaves its Sessions
            // for the next start's sweep to remove.
            yield* projects.delete({ id });
            for (const session of yield* allOf(sessionFeed))
              if (session.projectId === id) yield* removeSession(session.id);
            return true;
          }),
        ),
      removeSession: (id) => write(removeSession(id)),
      session: (id) =>
        run(sessions.get({ id }, { excludeDeleted: true })).pipe(
          Effect.map((found) => found?.value ?? null),
        ),
      allSessions: allOf(sessionFeed),
      saveSession: (session) =>
        write(
          Effect.gen(function* () {
            const found = yield* sessions.get({ id: session.id });
            if (found === null) yield* sessions.insert(session);
            else if (!found.meta._d && !same(found.value, session))
              yield* sessions.getAndUpdate({ id: session.id }, session);
          }),
        ),
      harnessAccounts: allOf<HarnessAccountRecord>({
        after: (cursor, limit = PAGE) =>
          run(
            harnessAccounts.query(
              'byUpdate',
              cursor === null
                ? { pk: {}, '>=': null }
                : { pk: {}, '>': { _u: cursor } },
              { limit },
            ),
          ),
        changes: changesOf<HarnessAccountRecord>(harnessAccounts.name),
      }),
      saveHarnessAccount: (account) =>
        write(
          Effect.gen(function* () {
            const found = yield* harnessAccounts.get({ id: account.id });
            if (found === null) yield* harnessAccounts.insert(account);
            else if (!found.meta._d && !same(found.value, account))
              yield* harnessAccounts.getAndUpdate({ id: account.id }, account);
          }),
        ),
      removeHarnessAccount: (id) =>
        write(
          Effect.gen(function* () {
            const found = yield* harnessAccounts.get(
              { id },
              { excludeDeleted: true },
            );
            if (found === null) return false;
            yield* harnessAccounts.delete({ id });
            return true;
          }),
        ),
    };
    return service;
  });

/** The Store over `table`. */
export const storeOver = (table: StoreTable): Layer.Layer<Store> =>
  Layer.effect(Store, make(table));
