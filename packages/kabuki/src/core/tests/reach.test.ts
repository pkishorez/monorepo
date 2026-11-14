import { Effect, Schema } from 'effect';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { Actor, Snapshot } from '../index.ts';
import type { LiveInstance, Sent } from '../runtime/index.ts';
import {
  Auth,
  ServerLive,
  fork,
  line,
  run,
  settle,
  start,
  stop,
  to,
  scoped,
} from './fixtures.ts';

/*
 * An app reached from outside its tree: the root Instance, typed by its
 * Actor and always live, and every Instance below it, narrowed by State.
 */

const Row = Actor.define('Row', {
  props: Schema.Struct({ index: Schema.Number }),
  model: Schema.Struct({ text: Schema.String }),
  state: Schema.TaggedUnion({ Idle: {}, Failed: { reason: Schema.String } }),
  message: Schema.TaggedUnion({
    Broke: { reason: Schema.String },
    Retried: {},
    Edited: { text: Schema.String.check(Schema.isNonEmpty()) },
  }),
}).build({
  init: () => ({ model: { text: '' }, state: { _tag: 'Idle' } }),
  on: {
    Broke: ({ reason }) => ({ state: { _tag: 'Failed', reason } }),
    Retried: () => ({ state: { _tag: 'Idle' } }),
    Edited: ({ text }) => ({ model: { text } }),
  },
  workers: { sync: { run: () => Effect.never } },
});

const Detail = Actor.define('Detail', {}).build({});

const Board = Actor.define('Board', {
  model: Schema.Struct({
    ids: Schema.Array(Schema.String),
    open: Schema.Boolean,
  }),
  message: Schema.TaggedUnion({
    Added: { id: Schema.String },
    Removed: { id: Schema.String },
    Toggled: {},
  }),
}).build({
  init: () => ({ model: { ids: ['a', 'b'], open: false } }),
  children: {
    rows: Actor.child(Row, {
      each: ({ model }) => model.ids,
      props: ({ model }, id) => ({ index: model.ids.indexOf(id) }),
    }),
    detail: Actor.child(Detail, { while: ({ model }) => model.open }),
  },
  on: {
    Added: ({ id }, { model }) => ({
      model: { ...model, ids: [...model.ids, id] },
    }),
    Removed: ({ id }, { model }) => ({
      model: { ...model, ids: model.ids.filter((kept) => kept !== id) },
    }),
    Toggled: (_, { model }) => ({ model: { ...model, open: !model.open } }),
  },
});

describe('an Instance reached from outside', () => {
  it('reads the app live: what it reads is what the app holds now', () =>
    run(
      Effect.gen(function* () {
        const running = yield* scoped(Board);
        const board = running.root;
        expect(board.address).toBe('Board');
        expect(board.model.ids).toEqual(['a', 'b']);
        expect(board.send({ _tag: 'Added', id: 'c' })).toBe('handled');
        expect(board.model.ids).toEqual(['a', 'b', 'c']);
      }),
    ));

  it('reaches an Instance straight at its Address, the same one walking down reaches', () =>
    run(
      Effect.gen(function* () {
        const running = yield* scoped(Board);
        const walked = running.root.children.rows[1]!;
        const found = running.at(walked.address);
        expectTypeOf(found).toEqualTypeOf<
          LiveInstance<typeof Row> | undefined
        >();
        expect(found?.address).toBe(walked.address);
        expect(found?.key).toBe('b');
        expect(found?.props).toEqual({ index: 1 });
        // Either one Sends, and both read what came of it.
        expect(found?.send({ _tag: 'Edited', text: 'hi' })).toBe('handled');
        expect(walked.model.text).toBe('hi');
        expect(walked.send({ _tag: 'Broke', reason: 'offline' })).toBe(
          'handled',
        );
        expect(found?.state).toEqual({ _tag: 'Failed', reason: 'offline' });
        expect(found?.model).toBe(walked.model);
        expect(found?.workers).toEqual(walked.workers);
        // The root is reached at its Address too.
        expect(running.at(running.root.address)?.model).toBe(
          running.root.model,
        );

        running.root.send({ _tag: 'Removed', id: 'b' });
        expect(running.at(walked.address)).toBeUndefined();
        expect(found?.stopped).toBe(true);
        expect(walked.stopped).toBe(true);
        // An Address the tree never had: none.
        expect(running.at(to(running, 'Board/rows[z]#1'))).toBeUndefined();
        expect(running.at(to(running, 'Board/detail#1'))).toBeUndefined();
      }),
    ));

  it('finds keyed Children as a list, and one that may be absent as undefined', () =>
    run(
      Effect.gen(function* () {
        const running = yield* scoped(Board);
        const board = running.root;
        expect(board.children.detail).toBeUndefined();
        expect(
          board.children.rows.map((row) => [row.key, row.props.index]),
        ).toEqual([
          ['a', 0],
          ['b', 1],
        ]);
        board.send({ _tag: 'Toggled' });
        expect(board.children.detail?.address).toBe('Board/detail#1');

        expectTypeOf(board.children.rows[0]!.key).toEqualTypeOf<string>();
        expectTypeOf(board.children.detail).toExtend<object | undefined>();
      }),
    ));

  it('narrows `state` and `children` together by `_tag`', () =>
    run(
      Effect.gen(function* () {
        const running = yield* scoped(Auth, { layer: ServerLive });
        yield* settle;
        const auth = running.root;
        expect(auth._tag).toBe('Anonymous');
        if (auth._tag !== 'Anonymous') throw new Error('not Anonymous');
        expect(auth.children.login.model.name).toBe('');
        // `todos` exists only while Authenticated.
        expectTypeOf(auth.children).not.toHaveProperty('todos');

        auth.send({ _tag: 'LoggedIn', user: 'ada' });
        const now = running.root;
        if (now._tag !== 'Authenticated') throw new Error('not Authenticated');
        expect(now.state.user).toBe('ada');
        expect(now.children.todos.model.items).toEqual([]);
      }),
    ));

  it('Sends from outside, named, and says what became of the Message', () =>
    run(
      Effect.gen(function* () {
        const running = yield* scoped(Board);
        const row = running.root.children.rows[0]!;
        expect(row.send({ _tag: 'Broke', reason: 'offline' })).toBe('handled');
        expect(row.state).toEqual({ _tag: 'Failed', reason: 'offline' });
        expect(row._tag === 'Failed' && row.state.reason).toBe('offline');
        // Refused at the Send: it does not match the Schema.
        expect(row.send({ _tag: 'Edited', text: '' })).toBe('refused');
        expect(row.model.text).toBe('');

        // @ts-expect-error: not one of Row's Messages.
        row.send({ _tag: 'Toggled' });
      }),
    ));

  it('stamps every Send as from outside, unless `from` says who Sent it', () =>
    run(
      Effect.gen(function* () {
        const running = yield* scoped(Board);
        running.root.send({ _tag: 'Toggled' });
        expect(line(running).at(-1)?.from).toEqual({ kind: 'outside' });
        running.root.send(
          { _tag: 'Toggled' },
          { kind: 'outside', name: 'admin' },
        );
        expect(line(running).at(-1)?.from).toEqual({
          kind: 'outside',
          name: 'admin',
        });
      }),
    ));

  it('reads the Workers of an Instance live', () =>
    run(
      Effect.gen(function* () {
        const running = yield* scoped(Board);
        yield* settle;
        const row = running.root.children.rows[0]!;
        expect(row.workers).toEqual([
          { name: 'sync', key: '', status: 'running' },
        ]);
      }),
    ));

  it('once stopped, reads what it held when last read, and nothing Sent to it arrives', () =>
    run(
      Effect.gen(function* () {
        const running = yield* scoped(Board);
        const board = running.root;
        const row = board.children.rows[0]!;
        row.send({ _tag: 'Edited', text: 'kept' });
        expect(row.model.text).toBe('kept');
        board.send({ _tag: 'Removed', id: 'a' });
        expect(row.stopped).toBe(true);
        expect(row.model.text).toBe('kept');
        expect(row.workers).toEqual([]);
        expect(row.send({ _tag: 'Retried' })).toBe('refused');

        // Back again, the key is a fresh Instance: the old one stays stopped.
        board.send({ _tag: 'Added', id: 'a' });
        expect(row.stopped).toBe(true);
        expect(board.children.rows.at(-1)?.address).toBe('Board/rows[a]#2');

        // The Runtime stopped, it still reads, and nothing Sent to it arrives; let go, it is stopped.
        yield* stop(running);
        expect(board.stopped).toBe(false);
        expect(board.workers).toEqual([]);
        expect(board.send({ _tag: 'Toggled' })).toBe('refused');
        yield* start(running);
        expect(board.send({ _tag: 'Toggled' })).toBe('handled');
        yield* Effect.promise(() => running.dispose());
        expect(board.stopped).toBe(true);
        expect(board.send({ _tag: 'Toggled' })).toBe('refused');
        expect(board.model.ids).toEqual(['b', 'a']);
      }),
    ));

  it('reached before the app starts over, is live again once a Snapshot followed brings its Address back', () =>
    run(
      Effect.gen(function* () {
        const running = yield* scoped(Board);
        const board = running.root;
        const row = board.children.rows[0]!;
        const saved = running.snapshot;
        board.send({ _tag: 'Removed', id: 'a' });
        expect(row.stopped).toBe(true);
        expect(row.send({ _tag: 'Retried' })).toBe('refused');

        yield* Effect.promise(() => running.follow(saved, { restart: true }));
        expect(running.root.children.rows[0]!.address).toBe(row.address);
        // Stopped only while its Address is not in the Snapshot: it is there again.
        expect(row.stopped).toBe(false);
        expect(row.send({ _tag: 'Broke', reason: 'offline' })).toBe('handled');
        expect(running.root.children.rows[0]!.state).toEqual({
          _tag: 'Failed',
          reason: 'offline',
        });
        expect(row.workers).toEqual([
          { name: 'sync', key: '', status: 'running' },
        ]);
      }),
    ));

  describe('Sent to by work a Snapshot followed starts', () => {
    let held: LiveInstance<typeof Lamp> | undefined;
    let armed = false;
    const sent: Array<Sent> = [];
    const Lamp = Actor.define('Lamp', {
      model: Schema.Struct({ on: Schema.Boolean, count: Schema.Number }),
      message: Schema.TaggedUnion({ Switched: {}, Bumped: {} }),
    }).build({
      init: () => ({ model: { on: false, count: 0 } }),
      on: {
        Switched: (_, { model }) => ({
          model: { ...model, on: !model.on },
        }),
        Bumped: (_, { model }) => ({
          model: { ...model, count: model.count + 1 },
        }),
      },
      workers: {
        glow: {
          while: ({ model }) => model.on,
          run: () => {
            if (armed) sent.push(held!.send({ _tag: 'Bumped' }));
            return Effect.never;
          },
        },
      },
    });

    /** A Lamp switched off, its Snapshot while on, and a Worker that Sends through the handle as it starts. */
    const lamp = Effect.gen(function* () {
      armed = false;
      sent.length = 0;
      const running = yield* scoped(Lamp);
      held = running.root;
      held.send({ _tag: 'Switched' });
      const on = running.snapshot;
      held.send({ _tag: 'Switched' });
      armed = true;
      return { running, on };
    });

    it('is refused while the app starts over: the Runtime does not run until its work has started', () =>
      run(
        Effect.gen(function* () {
          const { running, on } = yield* lamp;
          yield* Effect.promise(() => running.follow(on, { restart: true }));
          expect(sent).toEqual(['refused']);
          expect(running.root.model).toEqual({ on: true, count: 0 });
          expect(line(running).map((e) => e.message._tag)).toEqual([
            'Switched',
            'Switched',
          ]);
        }),
      ));

    it('waits its turn when only what differs changes: it is played once the Snapshot is in place', () =>
      run(
        Effect.gen(function* () {
          const { running, on } = yield* lamp;
          yield* Effect.promise(() => running.follow(on));
          expect(sent).toEqual(['queued']);
          expect(running.root.model).toEqual({ on: true, count: 1 });
          expect(line(running).map((e) => e.message._tag)).toEqual([
            'Switched',
            'Switched',
            'Bumped',
          ]);
        }),
      ));
  });

  it('stays live through a Snapshot that is rejected', () =>
    run(
      Effect.gen(function* () {
        const running = yield* scoped(Board);
        const board = running.root;
        const row = board.children.rows[0]!;
        const before = running.snapshot;
        // Not a Snapshot of this app: its root is another Actor's.
        const failed = yield* Effect.promise(() =>
          // @ts-expect-error a Snapshot of Detail is not one of Board
          running.follow(Snapshot.init(Detail)).then(
            () => undefined,
            (error: unknown) => error,
          ),
        );
        expect(failed).toBeInstanceOf(TypeError);
        expect(running.snapshot).toBe(before);
        expect(row.stopped).toBe(false);
        expect(row.send({ _tag: 'Retried' })).toBe('handled');
      }),
    ));

  it('reached before a Fork, is live after it: it reads the app started over', () =>
    run(
      Effect.gen(function* () {
        const running = yield* scoped(Board);
        const board = running.root;
        board.send({ _tag: 'Removed', id: 'a' });
        board.send({ _tag: 'Added', id: 'c' });
        const added = board.children.rows[1]!;
        added.send({ _tag: 'Edited', text: 'kept' });
        expect(added.model.text).toBe('kept');
        expect(board.model.ids).toEqual(['b', 'c']);
        yield* fork(running, null);
        yield* settle;
        // The root never leaves the tree: the same handle reads init again, and Sends.
        expect(board.stopped).toBe(false);
        expect(board.model.ids).toEqual(['a', 'b']);
        expect(board.children.rows[0]!.address).toBe('Board/rows[a]#1');
        expect(board.children.rows[0]!.workers).toEqual([
          { name: 'sync', key: '', status: 'running' },
        ]);
        expect(board.send({ _tag: 'Removed', id: 'b' })).toBe('handled');
        expect(board.model.ids).toEqual(['a']);
        // An Instance the Fork left behind is stopped, and reads what it held.
        expect(added.address).toBe('Board/rows[c]#1');
        expect(added.stopped).toBe(true);
        expect(added.model.text).toBe('kept');
        expect(added.workers).toEqual([]);
        expect(added.send({ _tag: 'Retried' })).toBe('refused');
      }),
    ));
});
