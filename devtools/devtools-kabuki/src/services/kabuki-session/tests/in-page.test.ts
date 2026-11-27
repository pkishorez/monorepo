import { Effect, Exit, Fiber, Option, Schema, Stream } from 'effect';
import type { Scope } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Actor } from '@kestack/kabuki';
import type { AppRuntime } from '@kestack/kabuki/react/types';
import {
  Looked,
  Stepped,
  Told,
} from '../../../server/rpc/session/contract/index.ts';
import { KabukiSession } from '../contract/index.ts';
import type { Told as ToldType } from '../contract/index.ts';
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

const toldNow = (session: KabukiSession['Service']) =>
  session
    .history({})
    .pipe(Stream.runHead, Effect.map(Option.getOrThrow<ToldType>));

const roundTrips = <S extends Schema.Codec<unknown, unknown>>(
  schema: S,
  value: S['Type'],
) => {
  const encoded = Schema.encodeSync(schema)(value);
  expect(JSON.parse(JSON.stringify(encoded))).toEqual(encoded);
};

describe('history', () => {
  it('tells where the app is and every entry kept, then each new entry once, light: whether it changed anything, not what', () =>
    run(
      Effect.gen(function* () {
        const { session, write } = yield* written;
        const seen: Array<ToldType> = [];
        const fiber = yield* session.history({}).pipe(
          Stream.runForEach((watched) => Effect.sync(() => seen.push(watched))),
          Effect.forkScoped,
        );
        yield* settle;
        const [first] = seen;
        const [one, two] = first!.entries;
        expect(first!.now).toEqual({
          head: two!.id,
          previewing: null,
          running: true,
          failure: null,
          url: '',
          revision: 0,
        });
        expect(first!.roots).toEqual([one!.id]);
        expect(one).toEqual({
          id: one!.id,
          parent: null,
          to: 'Diary',
          tag: 'Wrote',
          from: { kind: 'outside' },
          at: expect.any(Number),
          outcome: 'handled',
          changed: true,
        });
        expect(two).toMatchObject({ parent: one!.id });
        write('third', 12);
        yield* settle;
        const last = seen.at(-1)!;
        expect(last.epoch).toBe(first!.epoch);
        expect(last.entries).toMatchObject([{ parent: two!.id, tag: 'Wrote' }]);
        expect(last.now.revision).toBeGreaterThan(0);
        expect(seen.flatMap(({ entries }) => entries)).toHaveLength(3);
        roundTrips(Told, last);
        yield* Fiber.interrupt(fiber);
      }),
    ));

  it('never drops an entry, however fast they come', () =>
    run(
      Effect.gen(function* () {
        const { session, write } = yield* written;
        const seen: Array<ToldType> = [];
        const fiber = yield* session.history({}).pipe(
          Stream.runForEach((watched) => Effect.sync(() => seen.push(watched))),
          Effect.forkScoped,
        );
        yield* settle;
        for (let i = 0; i < 20; i++) write(`note ${i}`, i);
        yield* settle;
        const ids = seen.flatMap(({ entries }) => entries.map(({ id }) => id));
        expect(ids).toHaveLength(22);
        expect(new Set(ids).size).toBe(22);
        yield* Fiber.interrupt(fiber);
      }),
    ));

  it("keeps every Branch's entries, so a Fork's old Branch is still there, and sends only what is new", () =>
    run(
      Effect.gen(function* () {
        const { session, write } = yield* written;
        const seen: Array<ToldType> = [];
        const fiber = yield* session.history({}).pipe(
          Stream.runForEach((watched) => Effect.sync(() => seen.push(watched))),
          Effect.forkScoped,
        );
        yield* settle;
        const [first, second] = seen[0]!.entries;
        yield* session.fork({ from: first!.id });
        yield* settle;
        write('third', 12);
        yield* settle;
        const last = seen.at(-1)!;
        expect(last.epoch).toBe(seen[0]!.epoch);
        expect(last.entries).toMatchObject([{ parent: first!.id }]);
        expect(last.now.head).toBe(last.entries[0]!.id);
        const { entries } = yield* toldNow(session);
        expect(entries.map(({ id }) => id)).toContain(second!.id);
        expect(entries).toHaveLength(3);
        yield* Fiber.interrupt(fiber);
      }),
    ));

  it('says which entries the start is followed by once the History is Compacted, in the same epoch', () =>
    run(
      Effect.gen(function* () {
        const { session, app } = yield* written;
        const seen: Array<ToldType> = [];
        const fiber = yield* session.history({}).pipe(
          Stream.runForEach((watched) => Effect.sync(() => seen.push(watched))),
          Effect.forkScoped,
        );
        yield* settle;
        const [, second] = seen[0]!.entries;
        app.keep(1);
        yield* settle;
        expect(seen.at(-1)).toMatchObject({
          epoch: seen[0]!.epoch,
          entries: [],
          roots: [second!.id],
        });
        yield* Fiber.interrupt(fiber);
      }),
    ));

  it('starts a new epoch, with every entry again, once the History is started over', () =>
    run(
      Effect.gen(function* () {
        const { session, app, write } = yield* written;
        const seen: Array<ToldType> = [];
        const fiber = yield* session.history({}).pipe(
          Stream.runForEach((watched) => Effect.sync(() => seen.push(watched))),
          Effect.forkScoped,
        );
        yield* settle;
        app.startOver();
        yield* settle;
        write('again', 20);
        yield* settle;
        const last = seen.at(-1)!;
        expect(last.epoch).not.toBe(seen[0]!.epoch);
        expect(last.entries).toMatchObject([{ parent: null, tag: 'Wrote' }]);
        expect(last.roots).toEqual([last.entries[0]!.id]);
        yield* Fiber.interrupt(fiber);
      }),
    ));

  it('carries on from where its caller is, in the same epoch, and from the start in another', () =>
    run(
      Effect.gen(function* () {
        const { session, write } = yield* written;
        const { epoch, entries } = yield* toldNow(session);
        write('third', 12);
        yield* settle;
        const after = { epoch, after: entries.at(-1)!.id };
        const resumed = yield* session
          .history({ from: after })
          .pipe(Stream.runHead, Effect.map(Option.getOrThrow<ToldType>));
        expect(resumed.epoch).toBe(epoch);
        expect(resumed.entries).toMatchObject([
          { parent: entries.at(-1)!.id, tag: 'Wrote' },
        ]);
        const other = yield* session
          .history({ from: { epoch: 'gone', after: 99 } })
          .pipe(Stream.runHead, Effect.map(Option.getOrThrow<ToldType>));
        expect(other.entries).toHaveLength(3);
      }),
    ));

  it('tells the page again when the app moves to another', () =>
    run(
      Effect.gen(function* () {
        const page = { href: 'http://localhost:5173/' };
        vi.stubGlobal('location', page);
        const { session, write } = yield* written;
        const urls: Array<string> = [];
        const fiber = yield* session.history({}).pipe(
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
        expect((yield* toldNow(session)).now.running).toBe(false);
        yield* Effect.promise(() => runtime.start());
        expect((yield* toldNow(session)).now.running).toBe(true);
      }),
    ));
});

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

const Door = Actor.define('Door', {
  description: 'A door that swings open when pushed',
  state: { Closed: {}, Opening: { since: Schema.Number } },
  model: { knocks: Schema.Number },
  message: {
    Pushed: Schema.Struct({}).annotate({ description: 'Someone pushes it' }),
    Swung: {},
    Knocked: {},
  },
}).build({
  init: () => ({ state: { _tag: 'Closed' }, model: { knocks: 0 } }),
  on: {
    Knocked: (_, { model }) => ({ model: { knocks: model.knocks + 1 } }),
  },
  workers: { creak: { run: () => Effect.never } },
  states: {
    Closed: {
      on: { Pushed: () => ({ state: { _tag: 'Opening', since: 3 } }) },
    },
    Opening: {
      workers: { swing: { run: () => Effect.never } },
      on: { Swung: () => ({ state: { _tag: 'Closed' } }) },
    },
  },
});

describe('step', () => {
  it('gives the tree at an entry, the Message it played, encoded, and what it changed', () =>
    run(
      Effect.gen(function* () {
        const { session } = yield* written;
        const [first] = (yield* toldNow(session)).entries;
        const stepped = yield* session.step({ at: first!.id });
        expect(stepped).toEqual({
          at: first!.id,
          tree: {
            address: 'Diary',
            actor: 'Diary',
            slot: null,
            state: 'Single',
            data: {},
            model: {
              notes: [{ at: '1970-01-01T00:00:00.005Z', text: 'first' }],
            },
            workers: [],
            provides: [],
            children: [
              {
                address: 'Diary/counter#1',
                actor: 'Counter',
                slot: 'counter',
                state: 'Single',
                data: {},
                model: { count: 0 },
                workers: [],
                provides: [],
                children: [],
              },
            ],
          },
          message: {
            id: first!.id,
            to: 'Diary',
            tag: 'Wrote',
            message: {
              _tag: 'Wrote',
              note: { at: new Date(5).toISOString(), text: 'first' },
            },
            from: { kind: 'outside' },
            at: expect.any(Number),
            outcome: 'handled',
            commands: [],
            emits: [],
          },
          changes: [
            {
              _tag: 'Changed',
              address: 'Diary',
              actor: 'Diary',
              model: {
                notes: {
                  before: [],
                  after: [{ at: new Date(5).toISOString(), text: 'first' }],
                },
              },
              props: {},
              workers: { started: [], stopped: [] },
            },
          ],
        });
        roundTrips(Stepped, stepped);
      }),
    ));

  it("gives no Message and no change at the History's start", () =>
    run(
      Effect.gen(function* () {
        const { session } = yield* written;
        const start = yield* session.step({ at: 'start' });
        expect(start).toMatchObject({
          at: 'start',
          message: null,
          changes: [],
        });
        expect(start.work).toBeUndefined();
      }),
    ));

  it('gives the Work report only at the Head', () =>
    run(
      Effect.gen(function* () {
        const Broken = Actor.define('Broken', {
          model: { ticks: Schema.Number },
          message: { Ticked: {} },
        }).build({
          init: () => ({ model: { ticks: 0 } }),
          on: {
            Ticked: (_, { model }) => ({ model: { ticks: model.ticks + 1 } }),
          },
          workers: {
            tick: { run: () => Effect.never },
            fail: { run: () => Effect.die(new Error('no line')) },
          },
        });
        const { app, runtime } = yield* running(Broken);
        runtime.root.send({ _tag: 'Ticked' });
        runtime.root.send({ _tag: 'Ticked' });
        yield* settle;
        const session = yield* sessionOf(app);
        const head = yield* session.step({});
        expect(head.at).toBe(app.history.head);
        expect(head.work!.instances['Broken']!.workers).toEqual([
          {
            name: 'tick',
            key: '',
            status: 'running',
            since: expect.any(Number),
          },
          {
            name: 'fail',
            key: '',
            status: 'failed',
            failure: expect.stringContaining('no line'),
            since: expect.any(Number),
          },
        ]);
        expect(head.work!.failures).toEqual([
          expect.objectContaining({
            address: 'Broken',
            kind: 'worker',
            name: 'fail',
            failure: expect.stringContaining('no line'),
          }),
        ]);
        roundTrips(Stepped, head);
        expect(
          (yield* session.step({ at: app.history.head! })).work,
        ).toBeDefined();
        const [first] = (yield* toldNow(session)).entries;
        expect((yield* session.step({ at: first!.id })).work).toBeUndefined();
      }),
    ));

  it("tells a Child's change as the Child's, and an Instance added whole, keyed", () =>
    run(
      Effect.gen(function* () {
        const { session, bump } = yield* written;
        bump();
        yield* settle;
        expect((yield* session.step({})).changes).toEqual([
          {
            _tag: 'Changed',
            address: 'Diary/counter#1',
            actor: 'Counter',
            model: { count: { before: 0, after: 1 } },
            props: {},
            workers: { started: [], stopped: [] },
          },
        ]);
        const { app, runtime } = yield* running(Shelf);
        runtime.root.send({ _tag: 'Added', id: 'a' });
        yield* settle;
        const shelf = yield* (yield* sessionOf(app)).step({});
        expect(shelf.changes).toEqual([
          expect.objectContaining({ _tag: 'Changed', address: 'Shelf' }),
          {
            _tag: 'Added',
            address: expect.stringMatching(/^Shelf\/rows/),
            actor: 'Counter',
            key: 'a',
            state: { _tag: 'Single' },
            model: { count: 0 },
            workers: [],
          },
        ]);
        expect(shelf.tree.children).toEqual([
          expect.objectContaining({ slot: 'rows', key: 'a', actor: 'Counter' }),
        ]);
      }),
    ));

  it('trims a large value in what changed', () =>
    run(
      Effect.gen(function* () {
        const diary = yield* started;
        for (let i = 0; i < 200; i++) diary.write(`note ${i} `.repeat(4), i);
        yield* settle;
        const session = yield* sessionOf(diary.app);
        const [change] = (yield* session.step({})).changes;
        const { after } = (
          change as { readonly model: Record<string, { after?: unknown }> }
        ).model['notes']!;
        expect((after as ReadonlyArray<unknown>).length).toBeLessThan(200);
      }),
    ));

  it('says which Steps are kept, also once the History is Compacted', () =>
    run(
      Effect.gen(function* () {
        const { session, app } = yield* written;
        const [first, second] = (yield* toldNow(session)).entries;
        expect(
          failure(yield* Effect.exit(session.step({ at: 999 }))),
        ).toMatchObject({
          error: {
            _tag: 'StepNotFound',
            step: 999,
            oldest: first!.id,
            newest: second!.id,
          },
        });
        app.keep(1);
        expect(
          failure(yield* Effect.exit(session.step({ at: first!.id }))),
        ).toMatchObject({
          error: {
            _tag: 'StepNotFound',
            oldest: second!.id,
            newest: second!.id,
          },
        });
      }),
    ));
});

describe('look', () => {
  it('describes one Instance: its State data and Model whole, and the Messages it takes', () =>
    run(
      Effect.gen(function* () {
        const diary = yield* started;
        for (let i = 0; i < 30; i++) diary.write(`note ${i}`, i);
        yield* settle;
        const session = yield* sessionOf(diary.app);
        const looked = yield* session.look({ address: 'Diary' });
        expect(looked).toMatchObject({
          at: diary.app.history.head,
          address: 'Diary',
          actor: 'Diary',
          description: 'Notes, each with when it was written',
          slot: null,
          state: 'Single',
          states: ['Single'],
          data: { _tag: 'Single' },
          workers: [],
          provides: [],
          takes: [
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
              within: 'always',
            },
          ],
        });
        const { notes } = looked.model as { notes: ReadonlyArray<unknown> };
        expect(notes).toHaveLength(30);
        expect(notes[0]).toEqual({
          at: new Date(0).toISOString(),
          text: 'note 0',
        });
        roundTrips(Looked, looked);
        const start = yield* session.look({ at: 'start', address: 'Diary' });
        expect(start.model).toEqual({ notes: [] });
      }),
    ));

  it('takes the Messages of its State and those it always takes, and wants the Workers of both, live only at the Head', () =>
    run(
      Effect.gen(function* () {
        const { app, runtime } = yield* running(Door);
        runtime.root.send({ _tag: 'Knocked' });
        yield* settle;
        const session = yield* sessionOf(app);
        const tags = (looked: Looked) =>
          looked.takes.map(({ tag, within }) => `${tag} ${within}`);
        const closed = yield* session.look({ address: 'Door' });
        expect(closed.states).toEqual(['Closed', 'Opening']);
        expect(tags(closed)).toEqual(['Pushed state', 'Knocked always']);
        expect(closed.takes[0]).toMatchObject({
          description: 'Someone pushes it',
        });
        expect(closed.workers).toEqual([
          {
            name: 'creak',
            within: 'always',
            runs: 'always',
            live: expect.objectContaining({ status: 'running' }),
          },
        ]);
        runtime.root.send({ _tag: 'Pushed' });
        yield* settle;
        const opening = yield* session.look({ address: 'Door' });
        expect(opening).toMatchObject({
          state: 'Opening',
          data: { _tag: 'Opening', since: 3 },
          model: { knocks: 1 },
        });
        expect(tags(opening)).toEqual(['Swung state', 'Knocked always']);
        expect(
          opening.workers.map(({ name, within, live }) => [
            name,
            within,
            live?.status,
          ]),
        ).toEqual(
          expect.arrayContaining([
            ['creak', 'always', 'running'],
            ['swing', 'state', 'running'],
          ]),
        );
        const [knocked] = (yield* toldNow(session)).entries;
        const past = yield* session.look({ at: knocked!.id, address: 'Door' });
        expect(past.workers).toEqual([
          { name: 'creak', within: 'always', runs: 'always' },
        ]);
      }),
    ));

  it('says which Instances are there when the one asked for is not', () =>
    run(
      Effect.gen(function* () {
        const { session } = yield* written;
        const { entries } = yield* toldNow(session);
        expect(
          failure(
            yield* Effect.exit(session.look({ address: 'Diary/nope#1' })),
          ),
        ).toMatchObject({
          error: {
            _tag: 'InstanceNotFound',
            instance: 'Diary/nope#1',
            at: entries[1]!.id,
            available: ['Diary', 'Diary/counter#1'],
          },
        });
        expect(
          failure(
            yield* Effect.exit(session.look({ at: 999, address: 'Diary' })),
          ),
        ).toMatchObject({ error: { _tag: 'StepNotFound', step: 999 } });
      }),
    ));

  it('reads a History Compacted to its Window: its start is right before the oldest entry kept', () =>
    run(
      Effect.gen(function* () {
        const { session, app } = yield* written;
        const [, second] = (yield* toldNow(session)).entries;
        app.keep(1);
        const { entries } = yield* toldNow(session);
        expect(entries).toMatchObject([{ id: second!.id, parent: null }]);
        const start = yield* session.look({ at: 'start', address: 'Diary' });
        expect(start.model).toEqual({
          notes: [{ at: new Date(5).toISOString(), text: 'first' }],
        });
      }),
    ));
});

describe('preview and fork', () => {
  it("Previews a Step, the History's start too, and goes back to the Head", () =>
    run(
      Effect.gen(function* () {
        const { session, app } = yield* written;
        const [first] = (yield* toldNow(session)).entries;
        yield* session.preview({ at: first!.id });
        expect(app.seeking?.entry).toBe(first!.id);
        expect((yield* toldNow(session)).now.previewing).toBe(first!.id);
        yield* session.preview({ at: 'start' });
        expect(app.seeking).toMatchObject({ entry: null });
        expect((yield* toldNow(session)).now.previewing).toBe('start');
        yield* session.preview({ at: null });
        expect(app.seeking).toBeNull();
        expect(
          failure(yield* Effect.exit(session.preview({ at: 999 }))),
        ).toMatchObject({ error: { _tag: 'StepNotFound' } });
      }),
    ));

  it("moves the Head to a Step, the History's start too, on the same Runtime", () =>
    run(
      Effect.gen(function* () {
        const { session, app, runtime } = yield* written;
        const [first] = (yield* toldNow(session)).entries;
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
        const asked = yield* session.step({}).pipe(Effect.forkScoped);
        yield* settle;
        expect(asked.pollUnsafe()).toBeUndefined();
        runtime = app.runtime;
        for (const listener of listeners) listener();
        const { tree } = yield* Fiber.join(asked);
        expect(tree.address).toBe('Diary');
      }),
    ));
});

afterEach(() => {
  vi.unstubAllGlobals();
});
