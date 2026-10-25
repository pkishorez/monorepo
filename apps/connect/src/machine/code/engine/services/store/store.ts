import { Effect, Layer, PubSub, Semaphore, Stream } from 'effect';
import { Broadcaster, type Entity } from '@kestack/std-toolkit/core';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';
import type { Raw } from '@kestack/ai-toolkit/contract';
import type { Project, Session } from '../../../records/index.js';
import {
  Store,
  type Feed,
  type StoreService,
} from '../../capabilities/index.js';
import { aiTable, harnessConfigs, projects, raws, sessions } from './table.js';

/*
 * The one place records are kept: Raw, Projects, Sessions and Harness
 * Configs in one SQLite
 * table. Every write goes through one permit, so writes land in `_u` order
 * and a reader that has seen a `_u` has seen everything older. Every write
 * is also published in this process, so a reader can subscribe before it
 * catches up and miss nothing in between.
 */

const PAGE = 200;

const same = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

/** The table's storage on one SQLite file, and the Broadcaster its writes publish to. */
const storage = (path: string, pubsub: PubSub.PubSub<Entity<unknown>>) => {
  const database = makeNodeSQLite({ path });
  const broadcaster = Layer.succeed(Broadcaster, {
    broadcast: (values) => {
      for (const value of values) PubSub.publishUnsafe(pubsub, value);
    },
    changes: Stream.fromPubSub(pubsub),
  });
  return {
    database,
    layer: Layer.merge(SQLite.make(aiTable, { database }).layer, broadcaster),
  };
};

type Storage = Layer.Success<ReturnType<typeof storage>['layer']>;

const make = (path: string) =>
  Effect.gen(function* () {
    const pubsub = yield* Effect.acquireRelease(
      PubSub.unbounded<Entity<unknown>>(),
      PubSub.shutdown,
    );
    const { database, layer } = storage(path, pubsub);
    yield* Effect.addFinalizer(() => Effect.sync(() => database.close?.()));
    yield* SQLite.setup(aiTable, { database, mode: 'persistent' }).pipe(
      Effect.orDie,
    );
    const context = yield* Layer.build(layer);
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
      lastRaw: (sessionId) =>
        run(
          raws.query(
            'bySession',
            { pk: { sessionId }, '<=': null },
            { limit: 1 },
          ),
        ).pipe(Effect.map(({ items }) => items[0]?.value ?? null)),
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
            yield* projects.delete({ id });
            return true;
          }),
        ),
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
            else if (!same(found.value, session))
              yield* sessions.getAndUpdate({ id: session.id }, session);
          }),
        ),
      harnessConfig: (harness) =>
        run(harnessConfigs.get({ id: harness }, { excludeDeleted: true })).pipe(
          Effect.map((found) => found?.value ?? null),
        ),
      saveHarnessConfig: (config) =>
        write(
          Effect.gen(function* () {
            const found = yield* harnessConfigs.get({ id: config.id });
            if (found === null) yield* harnessConfigs.insert(config);
            else if (!same(found.value, config))
              yield* harnessConfigs.getAndUpdate({ id: config.id }, config);
          }),
        ),
    };
    return service;
  });

/** The Store on the SQLite file at `path`; `:memory:` keeps it in memory. */
export const storeLayer = (path: string): Layer.Layer<Store> =>
  Layer.effect(Store, make(path));
