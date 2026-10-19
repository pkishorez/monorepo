import { Effect, Schema } from 'effect';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { Actor, History, Runtime, restore } from '../index.ts';
import { Auth, ServerLive, run, settle } from './fixtures.ts';

/*
 * An app reached from outside its tree: the root Instance, typed by its
 * Actor and always live, and every Instance below it, narrowed by State.
 */

const Row = Actor.build(
  Actor.define('Row', {
    props: Schema.Struct({ index: Schema.Number }),
    model: Schema.Struct({ text: Schema.String }),
    state: Schema.TaggedUnion({ Idle: {}, Failed: { reason: Schema.String } }),
    message: Schema.TaggedUnion({
      Broke: { reason: Schema.String },
      Retried: {},
      Edited: { text: Schema.String.check(Schema.isNonEmpty()) },
    }),
  }),
  {
    init: () => ({ model: { text: '' }, state: { _tag: 'Idle' } }),
    on: {
      Broke: ({ reason }) => ({ state: { _tag: 'Failed', reason } }),
      Retried: () => ({ state: { _tag: 'Idle' } }),
      Edited: ({ text }) => ({ model: { text } }),
    },
    workers: { sync: { run: () => Effect.never } },
  },
);

const Detail = Actor.build(Actor.define('Detail', {}), {});

const Board = Actor.build(
  Actor.define('Board', {
    model: Schema.Struct({
      ids: Schema.Array(Schema.String),
      open: Schema.Boolean,
    }),
    message: Schema.TaggedUnion({
      Added: { id: Schema.String },
      Removed: { id: Schema.String },
      Toggled: {},
    }),
  }),
  {
    init: () => ({ model: { ids: ['a', 'b'], open: false } }),
    children: {
      rows: {
        actor: Row,
        each: ({ model }) => model.ids,
        props: ({ model }, id) => ({ index: model.ids.indexOf(id) }),
      },
      detail: { actor: Detail, while: ({ model }) => model.open },
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
  },
);

describe('an Instance reached from outside', () => {
  it('reads the app live: what it reads is what the app holds now', () =>
    run(
      Effect.gen(function* () {
        const running = yield* Runtime.start(Board);
        const board = running.instance({ from: 'test' });
        expect(board.id).toBe('Board');
        expect(board.model.ids).toEqual(['a', 'b']);
        expect(board.send({ _tag: 'Added', id: 'c' })).toBe(true);
        expect(board.model.ids).toEqual(['a', 'b', 'c']);
      }),
    ));

  it('finds keyed Children as a list, and one that may be absent as undefined', () =>
    run(
      Effect.gen(function* () {
        const running = yield* Runtime.start(Board);
        const board = running.instance({ from: 'test' });
        expect(board.children.detail).toBeUndefined();
        expect(
          board.children.rows.map((row) => [row.key, row.props.index]),
        ).toEqual([
          ['a', 0],
          ['b', 1],
        ]);
        board.send({ _tag: 'Toggled' });
        expect(board.children.detail?.id).toBe('Board/detail#1');

        expectTypeOf(board.children.rows[0]!.key).toEqualTypeOf<string>();
        expectTypeOf(board.children.detail).toExtend<object | undefined>();
      }),
    ));

  it('narrows `state` and `children` together by `_tag`', () =>
    run(
      Effect.gen(function* () {
        const running = yield* Runtime.start(Auth, ServerLive);
        yield* settle;
        const auth = running.instance({ from: 'test' });
        expect(auth._tag).toBe('Anonymous');
        if (auth._tag !== 'Anonymous') throw new Error('not Anonymous');
        expect(auth.children.login.model.name).toBe('');
        // `todos` exists only while Authenticated.
        expectTypeOf(auth.children).not.toHaveProperty('todos');

        auth.send({ _tag: 'LoggedIn', user: 'ada' });
        const now = running.instance({ from: 'test' });
        if (now._tag !== 'Authenticated') throw new Error('not Authenticated');
        expect(now.state.user).toBe('ada');
        expect(now.children.todos.model.items).toEqual([]);
      }),
    ));

  it('Sends from outside, named, and says whether the Message arrived', () =>
    run(
      Effect.gen(function* () {
        const running = yield* Runtime.start(Board);
        const row = running.instance({ from: 'admin' }).children.rows[0]!;
        expect(row.send({ _tag: 'Broke', reason: 'offline' })).toBe(true);
        expect(row.state).toEqual({ _tag: 'Failed', reason: 'offline' });
        expect(row._tag === 'Failed' && row.state.reason).toBe('offline');
        // Refused at the Send: it does not match the Schema.
        expect(row.send({ _tag: 'Edited', text: '' })).toBe(false);
        expect(row.model.text).toBe('');

        // @ts-expect-error: not one of Row's Messages.
        row.send({ _tag: 'Toggled' });
      }),
    ));

  it('stamps every Send with the name it was reached with', () =>
    run(
      Effect.gen(function* () {
        const running = yield* Runtime.start(History.make(Board));
        running.instance({ from: 'admin' }).send({ _tag: 'Toggled' });
        expect(running.history.branch().at(-1)?.source).toEqual({
          kind: 'outside',
          name: 'admin',
        });
      }),
    ));

  it('reads the Workers of an Instance live', () =>
    run(
      Effect.gen(function* () {
        const running = yield* Runtime.start(Board);
        yield* settle;
        const row = running.instance({ from: 'test' }).children.rows[0]!;
        expect(row.workers).toEqual([
          { name: 'sync', key: '', status: 'running' },
        ]);
      }),
    ));

  it('once stopped, reads what it held when last read, and nothing Sent to it arrives', () =>
    run(
      Effect.gen(function* () {
        const running = yield* Runtime.start(Board);
        const board = running.instance({ from: 'test' });
        const row = board.children.rows[0]!;
        row.send({ _tag: 'Edited', text: 'kept' });
        expect(row.model.text).toBe('kept');
        board.send({ _tag: 'Removed', id: 'a' });
        expect(row.stopped).toBe(true);
        expect(row.model.text).toBe('kept');
        expect(row.workers).toEqual([]);
        expect(row.send({ _tag: 'Retried' })).toBe(false);

        // Back again, the key is a fresh Instance: the old one stays stopped.
        board.send({ _tag: 'Added', id: 'a' });
        expect(row.stopped).toBe(true);
        expect(board.children.rows.at(-1)?.id).toBe('Board/rows[a]#2');

        yield* running.stop();
        expect(board.stopped).toBe(true);
        expect(board.send({ _tag: 'Toggled' })).toBe(false);
        expect(board.model.ids).toEqual(['b', 'a']);
      }),
    ));

  it('reached before a Restore, is stopped, though the Restore brings its ID back', () =>
    run(
      Effect.gen(function* () {
        const running = yield* Runtime.start(Board);
        const board = running.instance({ from: 'test' });
        const row = board.children.rows[0]!;
        const saved = running.snapshot();
        board.send({ _tag: 'Removed', id: 'a' });
        running.send('Board', { ...restore(saved) });
        expect(running.instance({ from: 'test' }).children.rows[0]!.id).toBe(
          row.id,
        );
        expect(row.stopped).toBe(true);
        expect(row.send({ _tag: 'Retried' })).toBe(false);
      }),
    ));

  it('stays live through a Restore that is refused', () =>
    run(
      Effect.gen(function* () {
        const running = yield* Runtime.start(Board);
        const board = running.instance({ from: 'test' });
        const row = board.children.rows[0]!;
        // Not for the root: dropped.
        running.send(row.id, { ...restore(running.snapshot()) });
        // Not a Snapshot of this app: ignored, with a warning.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        running.send('Board', {
          ...restore({ ...running.snapshot(), actor: 'Other' }),
        });
        warn.mockRestore();
        expect(row.stopped).toBe(false);
        expect(row.send({ _tag: 'Retried' })).toBe(true);
      }),
    ));

  it('reached before the Runtime last started, is stopped, though a new Instance has its ID', () =>
    run(
      Effect.gen(function* () {
        const running = yield* Runtime.start(History.make(Board));
        const board = running.instance({ from: 'test' });
        const row = board.children.rows[0]!;
        board.send({ _tag: 'Removed', id: 'a' });
        expect(board.model.ids).toEqual(['b']);
        yield* running.start(null);
        yield* settle;
        // Started over from init: `Board/rows[a]#1` is a new Instance.
        expect(running.instance({ from: 'test' }).children.rows[0]!.id).toBe(
          row.id,
        );
        expect(row.stopped).toBe(true);
        expect(row.workers).toEqual([]);
        expect(row.send({ _tag: 'Retried' })).toBe(false);
        expect(board.stopped).toBe(true);
        expect(board.model.ids).toEqual(['b']);
      }),
    ));
});
