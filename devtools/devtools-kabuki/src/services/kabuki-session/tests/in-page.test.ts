import { Effect, Exit, Fiber, Option, Schema, Stream } from 'effect';
import type { Scope } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Actor } from '@kestack/kabuki';
import type { AppRuntime } from '@kestack/kabuki/react/types';
import {
  Blueprinted,
  Look,
  Watched,
} from '../../../server/rpc/session/contract/index.ts';
import { KabukiSession } from '../contract/index.ts';
import type { Watched as WatchedType } from '../contract/index.ts';
import { inPage } from '../real/index.ts';
import { Counter, running, started } from './diary.ts';

const run = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

const settle = Effect.gen(function* () {
  for (let i = 0; i < 10; i++) yield* Effect.yieldNow;
});

const sessionOf = (app: AppRuntime) =>
  Effect.provide(Effect.service(KabukiSession), inPage(app));

const written = Effect.gen(function* () {
  const diary = yield* started;
  diary.write('first', 5);
  diary.write('second', 9);
  yield* settle;
  return { ...diary, session: yield* sessionOf(diary.app) };
});

const failure = <A, E>(exit: Exit.Exit<A, E>) =>
  Exit.isFailure(exit) ? exit.cause.reasons[0] : undefined;

const watchedNow = (session: KabukiSession['Service']) =>
  session
    .watch()
    .pipe(Stream.runHead, Effect.map(Option.getOrThrow<WatchedType>));

const roundTrips = <S extends Schema.Codec<unknown, unknown>>(
  schema: S,
  value: S['Type'],
) => {
  const encoded = Schema.encodeSync(schema)(value);
  expect(JSON.parse(JSON.stringify(encoded))).toEqual(encoded);
};

describe('blueprint', () => {
  it("reads every Actor the root can grow from the root's Blueprint, each by its place", () =>
    run(
      Effect.gen(function* () {
        const { session } = yield* written;
        const { root } = yield* session.blueprint();
        expect(root).toMatchObject({
          place: 'Diary',
          slot: null,
          actor: 'Diary',
          description: 'Notes, each with when it was written',
          condition: null,
          single: true,
          requires: [],
        });
        expect(root.top.messages).toEqual([
          {
            tag: 'Wrote',
            description: 'A note was written',
            payload: {
              kind: 'struct',
              fields: [
                {
                  name: 'note',
                  optional: false,
                  nullable: false,
                  shape: {
                    kind: 'struct',
                    fields: [
                      {
                        name: 'at',
                        optional: false,
                        nullable: false,
                        shape: { kind: 'text' },
                      },
                      {
                        name: 'text',
                        optional: false,
                        nullable: false,
                        shape: { kind: 'text' },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ]);
        expect(root.top.children).toEqual([
          {
            name: 'counter',
            actor: 'Counter',
            condition: 'always',
            keyed: false,
          },
        ]);
        expect(root.states['Single']).toMatchObject({
          messages: [],
          data: { kind: 'struct', fields: [] },
        });
        expect(root.children).toEqual([
          expect.objectContaining({
            place: 'Diary/counter',
            slot: 'counter',
            actor: 'Counter',
            condition: 'always',
            within: null,
            children: [],
          }),
        ]);
        roundTrips(Blueprinted, { root });
      }),
    ));

  it('offers every Message an Actor has a rule for, a Worker’s too, at its top and in each State', () =>
    run(
      Effect.gen(function* () {
        const Door = Actor.define('Door', {
          state: { Closed: {}, Opening: {} },
          message: { Pushed: {}, Swung: {}, Knocked: {} },
        }).build({
          init: () => ({ state: { _tag: 'Closed' } }),
          on: { Knocked: () => ({}) },
          states: {
            Closed: { on: { Pushed: () => ({ state: { _tag: 'Opening' } }) } },
            Opening: {
              workers: { swing: { run: () => Effect.never } },
              on: { Swung: () => ({ state: { _tag: 'Closed' } }) },
            },
          },
        });
        const { app } = yield* running(Door);
        const session = yield* sessionOf(app);
        const { root } = yield* session.blueprint();
        const tags = (level: {
          readonly messages: ReadonlyArray<{ readonly tag: string }>;
        }) => level.messages.map(({ tag }) => tag);
        expect(root.single).toBe(false);
        expect(tags(root.top)).toEqual(['Knocked']);
        expect(tags(root.states['Closed']!)).toEqual(['Pushed']);
        expect(tags(root.states['Opening']!)).toEqual(['Swung']);
        expect(root.states['Opening']!.workers).toEqual([
          { name: 'swing', condition: 'always' },
        ]);
      }),
    ));
});

describe('watch', () => {
  it('tells where the app is and every entry kept, at once and after each change', () =>
    run(
      Effect.gen(function* () {
        const { session, write } = yield* written;
        const seen: Array<WatchedType> = [];
        const fiber = yield* session.watch().pipe(
          Stream.runForEach((watched) => Effect.sync(() => seen.push(watched))),
          Effect.forkScoped,
        );
        yield* settle;
        const [first] = seen;
        expect(first!.now).toEqual({
          head: first!.entries[1]!.id,
          seeking: null,
          running: true,
          failure: null,
          url: '',
          revision: 0,
        });
        expect(first!.entries).toEqual([
          {
            id: first!.entries[0]!.id,
            parent: null,
            to: 'Diary',
            tag: 'Wrote',
            from: { kind: 'outside' },
            at: expect.any(Number),
            outcome: 'handled',
          },
          expect.objectContaining({ parent: first!.entries[0]!.id }),
        ]);
        write('third', 12);
        yield* settle;
        expect(seen.at(-1)!.entries).toHaveLength(3);
        expect(seen.at(-1)!.now.revision).toBeGreaterThan(0);
        roundTrips(Watched, seen.at(-1)!);
        yield* Fiber.interrupt(fiber);
      }),
    ));

  it("keeps every Branch's entries, so a Fork's old Branch is still there", () =>
    run(
      Effect.gen(function* () {
        const { session, write } = yield* written;
        const [first, second] = (yield* watchedNow(session)).entries;
        yield* session.fork({ from: first!.id });
        yield* settle;
        write('third', 12);
        yield* settle;
        const { now, entries } = yield* watchedNow(session);
        expect(entries.map(({ id }) => id)).toContain(second!.id);
        expect(entries).toHaveLength(3);
        expect(entries.find(({ id }) => id === now.head)!.parent).toBe(
          first!.id,
        );
      }),
    ));

  it('tells the page again when the app moves to another', () =>
    run(
      Effect.gen(function* () {
        const page = { href: 'http://localhost:5173/' };
        vi.stubGlobal('location', page);
        const { session, write } = yield* written;
        const urls: Array<string> = [];
        const fiber = yield* session.watch().pipe(
          Stream.runForEach(({ now }) => Effect.sync(() => urls.push(now.url))),
          Effect.forkScoped,
        );
        yield* settle;
        page.href = 'http://localhost:5173/items/1';
        write('third', 12);
        yield* Effect.sleep('5 millis');
        expect(urls.at(0)).toBe('http://localhost:5173/');
        expect(urls.at(-1)).toBe('http://localhost:5173/items/1');
        yield* Fiber.interrupt(fiber);
      }),
    ));

  it('says when the app is stopped, and running again', () =>
    run(
      Effect.gen(function* () {
        const { session, runtime } = yield* written;
        yield* Effect.promise(() => runtime.stop());
        expect((yield* watchedNow(session)).now.running).toBe(false);
        yield* Effect.promise(() => runtime.start());
        expect((yield* watchedNow(session)).now.running).toBe(true);
      }),
    ));
});

describe('look', () => {
  it('shows the Instances at the Head, what the Step did to each, and the data of the ones opened, encoded', () =>
    run(
      Effect.gen(function* () {
        const { session } = yield* written;
        const look = yield* session.look({ open: ['Diary'] });
        expect(look.root).toEqual({
          address: 'Diary',
          place: 'Diary',
          actor: 'Diary',
          slot: null,
          state: 'Single',
          change: 'changed',
          children: [
            {
              address: 'Diary/counter#1',
              place: 'Diary/counter',
              actor: 'Counter',
              slot: 'counter',
              state: 'Single',
              change: null,
              children: [],
            },
          ],
        });
        expect(look.opened).toEqual({
          Diary: {
            state: { _tag: 'Single' },
            model: {
              notes: [
                { at: new Date(5).toISOString(), text: 'first' },
                { at: new Date(9).toISOString(), text: 'second' },
              ],
            },
            folded: false,
            workers: [],
          },
        });
        roundTrips(Look, look);
      }),
    ));

  it("shows any Step: the History's start, or an entry, a Child's change as the Child's", () =>
    run(
      Effect.gen(function* () {
        const { session, bump } = yield* written;
        const [first] = (yield* watchedNow(session)).entries;
        const start = yield* session.look({ at: 'start', open: ['Diary'] });
        expect(start.at).toBe('start');
        expect(start.root.change).toBeNull();
        expect(start.opened['Diary']!.model).toEqual({ notes: [] });
        const one = yield* session.look({ at: first!.id, open: ['Diary'] });
        expect(one.opened['Diary']!.model).toEqual({
          notes: [{ at: new Date(5).toISOString(), text: 'first' }],
        });
        bump();
        yield* settle;
        const bumped = yield* session.look({ open: ['Diary/counter#1'] });
        expect(bumped.root.change).toBeNull();
        expect(bumped.root.children[0]!.change).toBe('changed');
        expect(bumped.opened['Diary/counter#1']!.model).toEqual({ count: 1 });
      }),
    ));

  it('marks an Instance the Step started, and keys a Child held under one', () =>
    run(
      Effect.gen(function* () {
        const Shelf = Actor.define('Shelf', {
          model: { ids: Schema.Array(Schema.String) },
          message: { Added: { id: Schema.String } },
        }).build({
          init: () => ({ model: { ids: [] } }),
          children: {
            rows: Actor.child(Counter, { each: ({ model }) => model.ids }),
          },
          on: {
            Added: ({ id }, { model }) => ({
              model: { ids: [...model.ids, id] },
            }),
          },
        });
        const { app, runtime } = yield* running(Shelf);
        runtime.root.send({ _tag: 'Added', id: 'a' });
        yield* settle;
        const session = yield* sessionOf(app);
        const { root } = yield* session.look({ open: [] });
        expect(root.change).toBe('changed');
        expect(root.children).toEqual([
          expect.objectContaining({
            slot: 'rows',
            key: 'a',
            place: 'Shelf/rows',
            change: 'started',
          }),
        ]);
      }),
    ));

  it('folds a large value, and says so', () =>
    run(
      Effect.gen(function* () {
        const diary = yield* started;
        for (let i = 0; i < 200; i++) diary.write(`note ${i} `.repeat(4), i);
        yield* settle;
        const session = yield* sessionOf(diary.app);
        const { opened } = yield* session.look({ open: ['Diary'] });
        expect(opened['Diary']!.folded).toBe(true);
        const { notes } = opened['Diary']!.model as { notes: unknown[] };
        expect(notes).toHaveLength(21);
        expect(notes.at(-1)).toBe('… 180 more items');
      }),
    ));

  it('tells the Workers an opened Instance runs, only at the Head of a running app', () =>
    run(
      Effect.gen(function* () {
        const Clock = Actor.define('Clock', {
          model: { ticks: Schema.Number },
          message: { Ticked: {} },
        }).build({
          init: () => ({ model: { ticks: 0 } }),
          on: {
            Ticked: (_, { model }) => ({ model: { ticks: model.ticks + 1 } }),
          },
          workers: { tick: { run: () => Effect.never } },
        });
        const { app, runtime } = yield* running(Clock);
        runtime.root.send({ _tag: 'Ticked' });
        yield* settle;
        const session = yield* sessionOf(app);
        const head = yield* session.look({ open: ['Clock'] });
        expect(head.opened['Clock']!.workers).toEqual([
          { name: 'tick', key: '', status: 'running' },
        ]);
        const start = yield* session.look({ at: 'start', open: ['Clock'] });
        expect(start.opened['Clock']!.workers).toEqual([]);
      }),
    ));

  it('says which Steps are kept, and which Instances are there', () =>
    run(
      Effect.gen(function* () {
        const { session } = yield* written;
        const { entries } = yield* watchedNow(session);
        expect(
          failure(yield* Effect.exit(session.look({ at: 999, open: [] }))),
        ).toMatchObject({
          error: {
            _tag: 'StepNotFound',
            step: 999,
            oldest: entries[0]!.id,
            newest: entries[1]!.id,
          },
        });
        expect(
          failure(yield* Effect.exit(session.look({ open: ['Diary/nope#1'] }))),
        ).toMatchObject({
          error: {
            _tag: 'InstanceNotFound',
            instance: 'Diary/nope#1',
            at: entries[1]!.id,
            available: ['Diary', 'Diary/counter#1'],
          },
        });
      }),
    ));

  it('reads a History Compacted to its Window: its start is right before the oldest entry kept', () =>
    run(
      Effect.gen(function* () {
        const { session, app } = yield* written;
        const [first, second] = (yield* watchedNow(session)).entries;
        app.keep(1);
        const { entries } = yield* watchedNow(session);
        expect(entries).toMatchObject([{ id: second!.id, parent: null }]);
        expect(
          failure(
            yield* Effect.exit(session.look({ at: first!.id, open: [] })),
          ),
        ).toMatchObject({
          error: {
            _tag: 'StepNotFound',
            oldest: second!.id,
            newest: second!.id,
          },
        });
        const start = yield* session.look({ at: 'start', open: ['Diary'] });
        expect(start.opened['Diary']!.model).toEqual({
          notes: [{ at: new Date(5).toISOString(), text: 'first' }],
        });
      }),
    ));
});

describe('travel and fork', () => {
  it("Seeks a Step, the History's start too, and goes back to the Head", () =>
    run(
      Effect.gen(function* () {
        const { session, app } = yield* written;
        const [first] = (yield* watchedNow(session)).entries;
        yield* session.travel({ to: first!.id });
        expect(app.seeking?.entry).toBe(first!.id);
        expect((yield* watchedNow(session)).now.seeking).toBe(first!.id);
        yield* session.travel({ to: 'start' });
        expect(app.seeking).toMatchObject({ entry: null });
        expect((yield* watchedNow(session)).now.seeking).toBe('start');
        yield* session.travel({ to: null });
        expect(app.seeking).toBeNull();
        expect(
          failure(yield* Effect.exit(session.travel({ to: 999 }))),
        ).toMatchObject({ error: { _tag: 'StepNotFound' } });
      }),
    ));

  it("moves the Head to a Step, the History's start too, on the same Runtime", () =>
    run(
      Effect.gen(function* () {
        const { session, app, runtime } = yield* written;
        const [first] = (yield* watchedNow(session)).entries;
        yield* session.fork({ from: first!.id });
        yield* settle;
        expect(app.runtime).toBe(runtime);
        expect(app.history.head).toBe(first!.id);
        yield* session.fork({ from: 'start' });
        yield* settle;
        expect(app.history.head).toBeNull();
        expect(
          failure(yield* Effect.exit(session.fork({ from: 999 }))),
        ).toMatchObject({ error: { _tag: 'StepNotFound' } });
      }),
    ));
});

describe('a call made before the app has its Runtime', () => {
  it('waits for it', () =>
    run(
      Effect.gen(function* () {
        const { app } = yield* started;
        let runtime: AppRuntime['runtime'] = null;
        const listeners = new Set<() => void>();
        const later: AppRuntime = {
          ...app,
          get history() {
            return app.history;
          },
          get runtime() {
            return runtime;
          },
          subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
        };
        const session = yield* sessionOf(later);
        const asked = yield* session.look({ open: [] }).pipe(Effect.forkScoped);
        yield* settle;
        expect(asked.pollUnsafe()).toBeUndefined();
        runtime = app.runtime;
        for (const listener of listeners) listener();
        const { root } = yield* Fiber.join(asked);
        expect(root.address).toBe('Diary');
      }),
    ));
});

afterEach(() => {
  vi.unstubAllGlobals();
});
