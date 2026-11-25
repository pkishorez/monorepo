import { Effect, Schema } from 'effect';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { Actor, Command } from '../index.ts';
import type { Tried } from '../types.ts';
import type { LiveInstance } from '../runtime/index.ts';
import { historyOf, run, scoped, send } from './fixtures.ts';

/*
 * `try` says what a Message would do to an Instance, from the Snapshot
 * alone: nothing is Sent, nothing runs, and the History does not move.
 */

const save = Command.make('save', {
  args: Schema.Struct({ id: Schema.String }),
  run: () => Effect.void,
});

const Row = Actor.define('Row', {
  model: { done: Schema.Boolean },
  message: { Ticked: {}, Untouched: {} },
  emits: { Finished: {} },
}).build({
  init: () => ({ model: { done: false } }),
  on: {
    Ticked: () => ({ model: { done: true }, emit: { _tag: 'Finished' } }),
    Untouched: () => ({}),
  },
});

const List = Actor.define('List', {
  model: {
    ids: Schema.Array(Schema.String),
    done: Schema.Array(Schema.String),
    title: Schema.String,
  },
  state: { Loading: {}, Ready: {}, Closed: {} },
  message: {
    Loaded: { ids: Schema.Array(Schema.String) },
    Toggled: { id: Schema.String },
    Retitled: { title: Schema.String },
    Broken: {},
    Finished: { id: Schema.String },
    Closed: {},
  },
}).build({
  init: () => ({
    model: { ids: [], done: [], title: '' },
    state: { _tag: 'Loading' },
  }),
  on: { Retitled: ({ title }) => ({ model: { title } }) },
  states: {
    Loading: {
      on: {
        Loaded: ({ ids }) => ({ model: { ids }, state: { _tag: 'Ready' } }),
      },
    },
    Ready: {
      children: {
        rows: Actor.child(Row, {
          each: ({ model }) => model.ids,
          emits: { Finished: (_, id) => ({ _tag: 'Finished', id }) },
        }),
      },
      on: {
        Toggled: ({ id }, { model }) =>
          model.ids.includes(id)
            ? { model: { done: [...model.done, id] }, command: save({ id }) }
            : {},
        Broken: () => ({ model: { title: 7 as unknown as string } }),
        Finished: () => ({}),
        Closed: () => ({ state: { _tag: 'Closed' } }),
      },
    },
    Closed: {},
  },
});

/** The List's one row, once it is Ready. */
const rowOf = (list: LiveInstance<typeof List>) => {
  if (list._tag !== 'Ready') throw new Error('the List is not Ready');
  return list.children.rows[0]!;
};

describe('try says what a Message would do', () => {
  it('Changes: the Snapshot after, the Model fields that change, the Commands asked for', () =>
    run(
      Effect.gen(function* () {
        const app = yield* scoped(List);
        send(app, 'List', { _tag: 'Loaded', ids: ['a', 'b'] });
        const before = app.snapshot;
        const history = historyOf(app);

        const tried = app.root.try({ _tag: 'Toggled', id: 'a' });

        expect(tried._tag).toBe('Changes');
        if (tried._tag !== 'Changes') return;
        expect(tried.model).toEqual({ done: ['a'] });
        expect(tried.commands).toEqual([{ name: 'save', args: { id: 'a' } }]);
        expect(tried.emits).toEqual([]);
        expect(tried.snapshot.root.model).toEqual({
          ids: ['a', 'b'],
          done: ['a'],
          title: '',
        });
        expect(app.snapshot).toBe(before);
        expect(historyOf(app)).toBe(history);
        expect(app.root.model.done).toEqual([]);
      }),
    ));

  it('Changes: a Transition shows in the Snapshot after, with the Children it Invokes', () =>
    run(
      Effect.gen(function* () {
        const app = yield* scoped(List);
        const tried = app.root.try({ _tag: 'Loaded', ids: ['a'] });

        expect(tried._tag).toBe('Changes');
        if (tried._tag !== 'Changes') return;
        expect(tried.model).toEqual({ ids: ['a'] });
        expect(tried.snapshot.root._tag).toBe('Ready');
        expect(tried.snapshot.root.children).toHaveProperty('rows');
        expect(app.root._tag).toBe('Loading');
      }),
    ));

  it('Changes: what a Child Emits, as it gave it', () =>
    run(
      Effect.gen(function* () {
        const app = yield* scoped(List);
        send(app, 'List', { _tag: 'Loaded', ids: ['a'] });
        const row = rowOf(app.root);

        const tried = row.try({ _tag: 'Ticked' });

        expect(tried._tag).toBe('Changes');
        if (tried._tag !== 'Changes') return;
        expect(tried.model).toEqual({ done: true });
        expect(tried.emits).toEqual([{ _tag: 'Finished' }]);
        expect(row.model.done).toBe(false);
      }),
    ));

  it('NoChange: a rule that changes nothing, asks for nothing and Emits nothing', () =>
    run(
      Effect.gen(function* () {
        const app = yield* scoped(List);
        send(app, 'List', { _tag: 'Loaded', ids: ['a'] });
        expect(app.root.try({ _tag: 'Toggled', id: 'nope' })).toEqual({
          _tag: 'NoChange',
        });
        expect(app.root.try({ _tag: 'Retitled', title: '' })).toEqual({
          _tag: 'NoChange',
        });
      }),
    ));

  it('Unhandled: no rule in this State, with the States that have one', () =>
    run(
      Effect.gen(function* () {
        const app = yield* scoped(List);
        expect(app.root.try({ _tag: 'Toggled', id: 'a' })).toEqual({
          _tag: 'Unhandled',
          state: 'Loading',
          handledIn: ['Ready'],
        });
      }),
    ));

  it('Refused: a Message that does not match its Schema, or an Update that gives what its Schemas refuse', () =>
    run(
      Effect.gen(function* () {
        const app = yield* scoped(List);
        send(app, 'List', { _tag: 'Loaded', ids: ['a'] });

        const wrong = app.root.try({ _tag: 'Toggled', id: 1 } as never);
        expect(wrong._tag).toBe('Refused');
        if (wrong._tag === 'Refused')
          expect(wrong.reason).toContain('Message "Toggled"');

        const broken = app.root.try({ _tag: 'Broken' });
        expect(broken._tag).toBe('Refused');
        if (broken._tag === 'Refused')
          expect(broken.reason).toContain('the Model');
      }),
    ));

  it('InstanceNotFound: once the Instance is gone from the tree', () =>
    run(
      Effect.gen(function* () {
        const app = yield* scoped(List);
        send(app, 'List', { _tag: 'Loaded', ids: ['a'] });
        const row = rowOf(app.root);
        send(app, 'List', { _tag: 'Closed' });
        expect(row.try({ _tag: 'Ticked' })).toEqual({
          _tag: 'InstanceNotFound',
        });
      }),
    ));

  it('is typed by the Instance’s Actor', () =>
    run(
      Effect.gen(function* () {
        const app = yield* scoped(List);
        expectTypeOf(app.root.try).parameter(0).toHaveProperty('_tag');
        expectTypeOf(app.root.try({ _tag: 'Closed' })).toEqualTypeOf<
          Tried<{
            readonly ids: ReadonlyArray<string>;
            readonly done: ReadonlyArray<string>;
            readonly title: string;
          }>
        >();
      }),
    ));
});
