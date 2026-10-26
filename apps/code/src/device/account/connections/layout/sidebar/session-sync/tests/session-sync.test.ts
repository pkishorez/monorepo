import { createCollection } from '@tanstack/db';
import { Effect, Layer, Schema, type Scope } from 'effect';
import type { Session } from '@kestack/connect/code';
import { Actor, type Instance, Runtime, type Running } from '@kestack/kabuki';
import { Replicas } from '@kestack/std-toolkit/replica';
import { describe, expect, it } from 'vitest';
import { SessionSync } from '../index.ts';

/*
 * Session Sync follows what the sidebar shows: one `MessageIds` Query per
 * unsettled session of the Connections read, keyed by its session's id, each
 * on its own Connection. A session added or un-settled gets one at once, one
 * settled or taken away loses it, and the Connection Filter showing another
 * Connection swaps them for that Connection's. A Query kept across a change is
 * the same Instance, so its Window is never let go and opened again. It
 * holds only its session's message ids, not the messages.
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

/** Two Connections' Instances, their Sessions as the test writes them. */
const connections = () => {
  const of = Object.fromEntries(
    ['m1', 'm2'].map((id) => [
      id,
      {
        projects: shown<{ readonly id: string }>(),
        sessions: shown<Session>(),
        messages: shown<{ readonly id: string; readonly sessionId: string }>(),
      },
    ]),
  );
  const replicas = Layer.succeed(Replicas, {
    hold: (_replica, key) =>
      Effect.succeed({
        name: `ai·${key}`,
        key,
        stopped: Effect.never,
        collections: {
          projects: of[key]!.projects.collection,
          sessions: of[key]!.sessions.collection,
          messages: of[key]!.messages.collection,
        },
      } as never),
  });
  return { of, replicas };
};

/** The sidebar's part: the Connections it reads, as the test chooses them. */
const Owner = Actor.define('Owner', {
  model: Schema.Struct({ connectionIds: Schema.Array(Schema.String) }),
  message: Schema.TaggedUnion({
    Read: { connectionIds: Schema.Array(Schema.String) },
  }),
});
const OwnerLive = Actor.build(Owner, {
  init: () => ({ model: { connectionIds: ['m1'] } }),
  children: {
    sessionSync: {
      actor: SessionSync.actor,
      props: ({ model }) => ({ connectionIds: model.connectionIds }),
    },
  },
  on: { Read: ({ connectionIds }) => ({ model: { connectionIds } }) },
});

const wait = (ms = 30) =>
  Effect.promise(() => new Promise((done) => setTimeout(done, ms)));

const run = <A>(effect: Effect.Effect<A, unknown, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect) as Effect.Effect<A>);

const start = (layer: Layer.Layer<any>) =>
  Runtime.start(OwnerLive as never, layer as never) as Effect.Effect<
    Running<unknown>,
    never,
    Scope.Scope
  >;

/** Each `MessageIds` Query held: its key, its Connection and session, and its Instance id. */
const held = (app: Running<unknown>) => {
  const sync = app.snapshot().children['sessionSync'] as Instance;
  return ((sync.children['messages'] ?? []) as ReadonlyArray<Instance>).map(
    ({ id, key, props }) => ({ id, key, props }),
  );
};
const keys = (app: Running<unknown>) =>
  held(app)
    .map(({ key }) => key)
    .sort();

describe('Session Sync', () => {
  it('holds one MessageIds Query per unsettled session shown, keyed by its id, on its Connection', async () => {
    const { of, replicas } = connections();
    of['m1']!.sessions.write({ type: 'insert', value: session('s1') });
    of['m1']!.sessions.write({
      type: 'insert',
      value: session('s2', { settledAt: 5 }),
    });
    await run(
      Effect.gen(function* () {
        const app = yield* start(replicas);
        yield* wait();
        expect(held(app)).toEqual([
          {
            id: expect.any(String),
            key: 's1',
            props: { connectionId: 'm1', sessionId: 's1' },
          },
        ]);
      }),
    );
  });

  it('adds and drops a Query as sessions come, go, settle and un-settle, keeping the rest', async () => {
    const { of, replicas } = connections();
    const sessions = of['m1']!.sessions;
    sessions.write({ type: 'insert', value: session('s1') });
    await run(
      Effect.gen(function* () {
        const app = yield* start(replicas);
        yield* wait();
        const first = held(app)[0]!.id;

        sessions.write({ type: 'insert', value: session('s2') });
        yield* wait();
        expect(keys(app)).toEqual(['s1', 's2']);
        // The one already held is the same Query: its Window stays open.
        expect(held(app).find(({ key }) => key === 's1')?.id).toBe(first);

        sessions.write({
          type: 'update',
          value: session('s1', { settledAt: 9 }),
        });
        yield* wait();
        expect(keys(app)).toEqual(['s2']);

        sessions.write({ type: 'update', value: session('s1') });
        sessions.write({ type: 'delete', key: 's2' });
        yield* wait();
        expect(keys(app)).toEqual(['s1']);
      }),
    );
  });

  it('follows the Connections read, as the Connection Filter changes them', async () => {
    const { of, replicas } = connections();
    of['m1']!.sessions.write({ type: 'insert', value: session('a1') });
    of['m2']!.sessions.write({ type: 'insert', value: session('b1') });
    of['m2']!.sessions.write({ type: 'insert', value: session('b2') });
    await run(
      Effect.gen(function* () {
        const app = yield* start(replicas);
        const root = app.snapshot().id;
        yield* wait();
        expect(keys(app)).toEqual(['a1']);

        // Every Connection shown.
        app.send(root, { _tag: 'Read', connectionIds: ['m1', 'm2'] });
        yield* wait();
        expect(keys(app)).toEqual(['a1', 'b1', 'b2']);
        expect(held(app).find(({ key }) => key === 'b1')?.props).toEqual({
          connectionId: 'm2',
          sessionId: 'b1',
        });

        // Only the second.
        app.send(root, { _tag: 'Read', connectionIds: ['m2'] });
        yield* wait();
        expect(keys(app)).toEqual(['b1', 'b2']);

        // None, until the sidebar can choose.
        app.send(root, { _tag: 'Read', connectionIds: [] });
        yield* wait();
        expect(keys(app)).toEqual([]);
      }),
    );
  });

  it('holds only the ids of its session’s messages, not what they say', async () => {
    const { of, replicas } = connections();
    of['m1']!.sessions.write({ type: 'insert', value: session('s1') });
    const message = (id: string, sessionId: string, text: string) =>
      ({ id, sessionId, text }) as { id: string; sessionId: string };
    of['m1']!.messages.write({
      type: 'insert',
      value: message('a', 's1', 'hello'),
    });
    of['m1']!.messages.write({
      type: 'insert',
      value: message('b', 's2', 'elsewhere'),
    });
    await run(
      Effect.gen(function* () {
        const app = yield* start(replicas);
        yield* wait();
        of['m1']!.messages.write({
          type: 'update',
          value: message('a', 's1', 'hello, and more'),
        });
        of['m1']!.messages.write({
          type: 'insert',
          value: message('c', 's1', 'again'),
        });
        yield* wait();
        const sync = app.snapshot().children['sessionSync'] as Instance;
        const [query] = sync.children['messages'] as ReadonlyArray<Instance>;
        const { rows } = query!.model as {
          rows: ReadonlyArray<{ row: Readonly<Record<string, unknown>> }>;
        };
        expect(rows.map(({ row }) => row['id'])).toEqual(['a', 'c']);
        expect(
          rows.some(({ row }) => 'text' in row || 'sessionId' in row),
        ).toBe(false);
      }),
    );
  });
});
