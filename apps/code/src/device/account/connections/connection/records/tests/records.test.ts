import { createCollection } from '@tanstack/db';
import { Effect, Fiber, Layer, Stream } from 'effect';
import type { Project, Session } from '@kestack/connect/code';
import { Replicas } from '@kestack/std-toolkit/replica';
import { describe, expect, it } from 'vitest';
import { arrival, type Everything, everything, lineage } from '../records.ts';

/*
 * What a Worker follows of the Connections, as the Replica shows it: a
 * Project or Session taken away, removed on this device or another, goes
 * from what it reads at once, as one added or changed comes, with no
 * reload.
 */

/** A Collection as an Instance shows the Store: rows written by its sync. */
const shown = <T extends { readonly id: string }>() => {
  let sync: {
    readonly begin: () => void;
    readonly write: (
      change:
        | { readonly type: 'insert' | 'update'; readonly value: T }
        | { readonly type: 'delete'; readonly key: string },
    ) => void;
    readonly commit: () => void;
  } | null = null;
  const collection = createCollection<T, string>({
    getKey: (row) => row.id,
    gcTime: 0,
    startSync: true,
    sync: {
      sync: (given) => {
        sync = given as unknown as NonNullable<typeof sync>;
        given.markReady();
      },
    },
  });
  const write = (
    change:
      | { readonly type: 'insert' | 'update'; readonly value: T }
      | { readonly type: 'delete'; readonly key: string },
  ) => {
    sync!.begin();
    sync!.write(change);
    sync!.commit();
  };
  return { collection, write };
};

const project = (id: string, at: Partial<Project> = {}): Project => ({
  id,
  name: id,
  path: `/home/me/${id}`,
  createdAt: 1,
  folder: 'present',
  ...at,
});

const session = (id: string, at: Partial<Session> = {}): Session => ({
  id,
  projectId: 'p1',
  harness: 'claude',
  account: 'claude',
  model: 'opus',
  settings: {},
  title: id,
  status: 'idle',
  nativeId: null,
  createdAt: 1,
  forkedFrom: null,
  settledAt: null,
  activeAt: 1,
  endedAt: null,
  ...at,
});

/** One Connection's Instance, its Collections shown as the test writes them. */
const connection = () => {
  const projects = shown<Project>();
  const sessions = shown<Session>();
  const messages = shown<{ readonly id: string }>();
  const replicas = Layer.succeed(Replicas, {
    hold: (_replica, key) =>
      Effect.succeed({
        name: `ai·${key}`,
        key,
        collections: {
          projects: projects.collection,
          sessions: sessions.collection,
          messages: messages.collection,
        },
      } as never),
  });
  return { projects, sessions, replicas };
};

/** Lets every change written reach the Worker. */
const tick = Effect.promise(() => new Promise((done) => setTimeout(done, 0)));

describe('every Project and Session of a Connection, followed', () => {
  it('drops one taken away at once, as it takes one added or changed', async () => {
    const { projects, sessions, replicas } = connection();
    projects.write({ type: 'insert', value: project('kept') });
    projects.write({ type: 'insert', value: project('removed') });
    sessions.write({
      type: 'insert',
      value: session('s1', { projectId: 'removed' }),
    });
    const seen: Array<Everything> = [];
    const latest = () => seen.at(-1)!;
    const names = () =>
      latest()
        .projects.map(({ name }) => name)
        .sort();

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const reading = yield* Effect.forkScoped(
            Stream.runForEach(everything(['m1']), (each) =>
              Effect.sync(() => void seen.push(each)),
            ),
          );
          yield* tick;
          expect(names()).toEqual(['kept', 'removed']);

          projects.write({ type: 'delete', key: 'removed' });
          sessions.write({ type: 'delete', key: 's1' });
          yield* tick;
          expect(names()).toEqual(['kept']);
          expect(latest().sessions).toEqual([]);

          projects.write({
            type: 'update',
            value: project('kept', { folder: 'missing' }),
          });
          projects.write({ type: 'insert', value: project('added') });
          yield* tick;
          expect(
            latest().projects.map(({ name, folder, connectionId }) => [
              name,
              folder,
              connectionId,
            ]),
          ).toEqual(
            expect.arrayContaining([
              ['kept', 'missing', 'm1'],
              ['added', 'present', 'm1'],
            ]),
          );
          expect(latest().projects).toHaveLength(2);
          yield* Fiber.interrupt(reading);
        }),
      ).pipe(Effect.provide(replicas)),
    );
  });

  it('drops a Session taken away from a lineage', async () => {
    const { sessions, replicas } = connection();
    sessions.write({ type: 'insert', value: session('original') });
    sessions.write({
      type: 'insert',
      value: session('fork', {
        forkedFrom: { sessionId: 'original', turnId: 't1' },
      }),
    });
    const seen: Array<ReadonlyArray<Session>> = [];

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const reading = yield* Effect.forkScoped(
            Stream.runForEach(lineage('m1', 'fork'), (each) =>
              Effect.sync(() => void seen.push(each)),
            ),
          );
          yield* tick;
          expect(seen.at(-1)!.map(({ id }) => id)).toEqual([
            'fork',
            'original',
          ]);

          sessions.write({ type: 'delete', key: 'original' });
          yield* tick;
          expect(seen.at(-1)!.map(({ id }) => id)).toEqual(['fork']);
          yield* Fiber.interrupt(reading);
        }),
      ).pipe(Effect.provide(replicas)),
    );
  });

  it('waits for a Session to be held, there already or to come, and leaves nothing listening', async () => {
    const { sessions, replicas } = connection();
    sessions.write({ type: 'insert', value: session('there') });
    // Counts what listens to the Sessions, as it subscribes and lets go.
    let listening = 0;
    const subscribe = sessions.collection.subscribeChanges.bind(
      sessions.collection,
    );
    sessions.collection.subscribeChanges = ((
      ...args: Parameters<typeof subscribe>
    ) => {
      listening += 1;
      const subscription = subscribe(...args);
      return {
        ...subscription,
        unsubscribe: () => {
          listening -= 1;
          subscription.unsubscribe();
        },
      };
    }) as typeof subscribe;

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* arrival('m1', 'there');
          expect(listening).toBe(0);

          const waiting = yield* Effect.forkScoped(arrival('m1', 'coming'));
          yield* tick;
          expect(waiting.pollUnsafe()).toBeUndefined();
          expect(listening).toBe(1);
          sessions.write({ type: 'insert', value: session('coming') });
          yield* Fiber.join(waiting);
          expect(listening).toBe(0);

          const never = yield* Effect.forkScoped(arrival('m1', 'never'));
          yield* tick;
          yield* Fiber.interrupt(never);
          expect(listening).toBe(0);
        }),
      ).pipe(Effect.provide(replicas)),
    );
  });
});
