import { Effect, Schema } from 'effect';
import type { Scope } from 'effect';
import { TestClock } from 'effect/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Replay, outcomeOf } from '../history/replay.ts';
import { init } from '../snapshot/engine/index.ts';
import { Actor, History, Runtime } from '../index.ts';
import type { SavedHistory } from '../history/index.ts';
import type { Running } from '../runtime/index.ts';
import { Snapshot } from '../snapshot/index.ts';
import type { Instance } from '../snapshot/index.ts';

// A list whose rows are handed whether they are selected --------------------------

const Cell = Actor.build(
  Actor.define('Cell', {
    props: Schema.Struct({ lit: Schema.Boolean }),
  }),
  {},
);

const Row = Actor.build(
  Actor.define('Row', {
    input: Schema.Struct({ text: Schema.String }),
    props: Schema.Struct({ selected: Schema.Boolean }),
    model: Schema.Struct({
      text: Schema.String,
      edits: Schema.Number,
      ticks: Schema.Number,
    }),
    message: Schema.TaggedUnion({ Edited: {}, Ticked: {} }),
  }),
  {
    init: ({ text }) => ({ model: { text, edits: 0, ticks: 0 } }),
    children: (child) => ({
      cell: child(Cell, { props: ({ props }) => ({ lit: props.selected }) }),
    }),
    on: {
      Edited: (_, { model, props }) =>
        props.selected ? { model: { ...model, edits: model.edits + 1 } } : {},
      Ticked: (_, { model }) => ({
        model: { ...model, ticks: model.ticks + 1 },
      }),
    },
    workers: {
      poll: {
        while: ({ props }) => props.selected,
        run: (self) =>
          Effect.forever(
            Effect.sleep('10 millis').pipe(
              Effect.andThen(self.send({ _tag: 'Ticked' })),
            ),
          ),
      },
    },
  },
);

const List = Actor.build(
  Actor.define('List', {
    model: Schema.Struct({
      ids: Schema.Array(Schema.String),
      selected: Schema.String,
      title: Schema.String,
    }),
    message: Schema.TaggedUnion({
      Selected: { id: Schema.String },
      Retitled: { title: Schema.String },
    }),
  }),
  {
    init: () => ({ model: { ids: ['a', 'b', 'c'], selected: 'a', title: '' } }),
    children: (child) => ({
      rows: child(Row, {
        each: ({ model }) => model.ids,
        input: (_, id) => ({ text: id }),
        props: ({ model }, id) => ({ selected: id === model.selected }),
      }),
    }),
    on: {
      Selected: ({ id }, { model }) => ({ model: { ...model, selected: id } }),
      Retitled: ({ title }, { model }) => ({ model: { ...model, title } }),
    },
  },
);

const row = (key: string) => `List/rows[${key}]#1`;

const at = (app: Running<unknown>, id: string): Instance => {
  const instance = Snapshot.instanceAt(app.snapshot(), id);
  expect(instance, id).toBeDefined();
  return instance!;
};

const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(Effect.provide(TestClock.layer())),
  );

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Props', () => {
  it("hands each Child its Props, and the Child's Update reads them", () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(History.make(List));
        expect(at(app, row('a')).props).toEqual({ selected: true });
        expect(at(app, row('b')).props).toEqual({ selected: false });
        app.send(row('b'), { _tag: 'Edited' });
        app.send(row('a'), { _tag: 'Edited' });
        expect(at(app, row('b')).model).toMatchObject({ edits: 0 });
        expect(at(app, row('a')).model).toMatchObject({ edits: 1 });
      }),
    ));

  it('a change runs none of the Child’s rules, and keeps the Instance while they say the same', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(History.make(List));
        const [a, b, c] = ['a', 'b', 'c'].map((key) => at(app, row(key)));
        app.send('List', { _tag: 'Retitled', title: 'Mine' });
        expect(at(app, row('a'))).toBe(a);
        expect(at(app, row('b'))).toBe(b);

        app.send('List', { _tag: 'Selected', id: 'b' });
        expect(at(app, row('a')).props).toEqual({ selected: false });
        expect(at(app, row('b')).props).toEqual({ selected: true });
        expect(at(app, row('a')).model).toBe(a!.model);
        expect(at(app, row('b')).model).toBe(b!.model);
        expect(at(app, row('c'))).toBe(c);
        // Only the parent's Message is in the History.
        expect(app.history.branch().map((entry) => entry.message._tag)).toEqual(
          ['Retitled', 'Selected'],
        );
      }),
    ));

  it("flow on down through a Child's own invoke", () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(History.make(List));
        expect(at(app, `${row('b')}/cell#1`).props).toEqual({ lit: false });
        app.send('List', { _tag: 'Selected', id: 'b' });
        expect(at(app, `${row('b')}/cell#1`).props).toEqual({ lit: true });
        expect(at(app, `${row('a')}/cell#1`).props).toEqual({ lit: false });
      }),
    ));

  it('start and stop the Workers whose Condition reads them', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(History.make(List));
        const running = (key: string) =>
          app.workers(row(key)).map(({ name }) => name);
        expect(running('a')).toEqual(['poll']);
        expect(running('b')).toEqual([]);
        app.send('List', { _tag: 'Selected', id: 'b' });
        expect(running('a')).toEqual([]);
        expect(running('b')).toEqual(['poll']);
        yield* TestClock.adjust('25 millis');
        expect(at(app, row('b')).model).toMatchObject({ ticks: 2 });
        expect(app.history.branch().at(-1)!.source).toEqual({
          kind: 'worker',
          instance: row('b'),
          name: 'poll',
        });
      }),
    ));

  it('are worked out again by Replay, never kept in the History', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(History.make(List));
        app.send('List', { _tag: 'Selected', id: 'c' });
        app.send(row('c'), { _tag: 'Edited' });
        app.send('List', { _tag: 'Selected', id: 'a' });
        expect(app.history.snapshotAt(app.history.head())).toEqual(
          app.snapshot(),
        );
        expect(Replay.fold(List.definition, app.history.branch())).toEqual(
          app.snapshot(),
        );
        expect(JSON.stringify(app.history.save().entries)).not.toContain(
          'selected"',
        );
      }),
    ));

  it('are checked against their Schema', () => {
    const Bad = Actor.build(Actor.define('Bad', {}), {
      children: (child) => ({
        row: child(Row, {
          input: () => ({ text: 'x' }),
          props: () => ({ selected: 'yes' as never }),
        }),
      }),
    });
    expect(() => init(Bad.definition)).toThrow(
      /Row: the Props of Bad\/row#1 does not match its Schema/,
    );
  });
});

describe('the History', () => {
  it('holds only the Envelope, from outside the tree unless a View says so', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(History.make(List));
        app.send('List', { _tag: 'Retitled', title: 'x' });
        app.send(
          row('a'),
          { _tag: 'Edited' },
          {
            kind: 'view',
            instance: row('a'),
          },
        );
        expect(app.history.branch()).toEqual([
          {
            id: 0,
            parent: null,
            destination: 'List',
            message: { _tag: 'Retitled', title: 'x' },
            source: { kind: 'outside' },
            at: 0,
          },
          {
            id: 1,
            parent: 0,
            destination: row('a'),
            message: { _tag: 'Edited' },
            source: { kind: 'view', instance: row('a') },
            at: 0,
          },
        ]);
      }),
    ));

  it('says what came of each entry, worked out, on a saved History too', () =>
    run(
      Effect.gen(function* () {
        const live = yield* Runtime.start(History.make(List));
        live.send('List', { _tag: 'Retitled', title: 'x' });
        live.send(row('b'), { _tag: 'Edited' });
        live.send('List', { _tag: 'Selected', id: 'b' });
        live.send(row('zzz'), { _tag: 'Edited' });
        const outcomes = (app: Running<unknown>) =>
          app.history.branch().map((entry) => app.history.outcome(entry.id));
        expect(outcomes(live)).toEqual([
          'handled',
          'handled',
          'handled',
          'dropped',
        ]);
        const saved = yield* Runtime.start(
          History.load(List, live.history.save()),
        );
        expect(outcomes(saved)).toEqual(outcomes(live));
      }),
    ));

  it('Replay warns of a Message that no longer fits, once, and skips it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const entries: SavedHistory['entries'] = [
      {
        id: 0,
        parent: null,
        destination: row('a'),
        message: { _tag: 'Renamed' },
        source: { kind: 'outside' },
        at: 0,
      },
      {
        id: 1,
        parent: 0,
        destination: row('a'),
        message: { _tag: 'Edited' },
        source: { kind: 'outside' },
        at: 0,
      },
    ];
    const snapshot = Replay.fold(List.definition, entries);
    Replay.fold(List.definition, entries);
    expect(Snapshot.instanceAt(snapshot, row('a'))!.model).toMatchObject({
      edits: 1,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('diverged at entry 0');
    // What came of it, worked out again, agrees with Replay: it changed nothing.
    expect(outcomeOf(List.definition, init(List.definition), entries[0]!)).toBe(
      'ignored',
    );
  });
});

// Types ---------------------------------------------------------------------------------

export const types = () => [
  Actor.build(Actor.define('NeedsProps', {}), {
    children: (child) => ({
      // @ts-expect-error a Child that declares Props must be handed them
      rows: child(Row, { each: () => ['a'], input: () => ({ text: 'a' }) }),
    }),
  }),
  Actor.build(Actor.define('WrongProps', {}), {
    children: (child) => ({
      // @ts-expect-error its Props must be the ones its Actor declares
      cell: child(Cell, { props: () => ({ lit: 'yes' }) }),
    }),
  }),
  Actor.build(
    Actor.define('Reads', {
      props: Schema.Struct({ n: Schema.Number }),
      message: Schema.TaggedUnion({ Go: {} }),
    }),
    {
      on: {
        // @ts-expect-error Props are read, never given back
        Go: (_, { props }) => ({ props: { n: props.n + 1 } }),
      },
    },
  ),
];
