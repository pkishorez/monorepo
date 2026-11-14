import { Effect, Schema } from 'effect';
import type { Scope } from 'effect';
import { TestClock } from 'effect/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Actor, History, Snapshot } from '../index.ts';
import type { Address, Runtime } from '../index.ts';
import type { Entry, Instance } from '../types.ts';
import { historyOf, line, scoped, send } from './fixtures.ts';

// A list whose rows are handed whether they are selected --------------------------

const Cell = Actor.define('Cell', {
  props: Schema.Struct({ lit: Schema.Boolean }),
}).build({});

const Row = Actor.define('Row', {
  input: Schema.Struct({ text: Schema.String }),
  props: Schema.Struct({ selected: Schema.Boolean }),
  model: Schema.Struct({
    text: Schema.String,
    edits: Schema.Number,
    ticks: Schema.Number,
  }),
  message: Schema.TaggedUnion({ Edited: {}, Ticked: {} }),
}).build({
  init: ({ text }) => ({ model: { text, edits: 0, ticks: 0 } }),
  children: {
    cell: Actor.child(Cell, {
      props: ({ props }) => ({ lit: props.selected }),
    }),
  },
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
});

const List = Actor.define('List', {
  model: Schema.Struct({
    ids: Schema.Array(Schema.String),
    selected: Schema.String,
    title: Schema.String,
  }),
  message: Schema.TaggedUnion({
    Selected: { id: Schema.String },
    Retitled: { title: Schema.String },
  }),
}).build({
  init: () => ({ model: { ids: ['a', 'b', 'c'], selected: 'a', title: '' } }),
  children: {
    rows: Actor.child(Row, {
      each: ({ model }) => model.ids,
      input: (_, id) => ({ text: id }),
      props: ({ model }, id) => ({ selected: id === model.selected }),
    }),
  },
  on: {
    Selected: ({ id }, { model }) => ({ model: { ...model, selected: id } }),
    Retitled: ({ title }, { model }) => ({ model: { ...model, title } }),
  },
});

const row = (key: string) => `List/rows[${key}]#1` as Address;

const at = (app: Runtime<any>, address: string): Instance => {
  const instance = Snapshot.at(app.snapshot, address as Address);
  expect(instance, address).toBeDefined();
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
        const app = yield* scoped(List);
        expect(at(app, row('a')).props).toEqual({ selected: true });
        expect(at(app, row('b')).props).toEqual({ selected: false });
        send(app, row('b'), { _tag: 'Edited' });
        send(app, row('a'), { _tag: 'Edited' });
        expect(at(app, row('b')).model).toMatchObject({ edits: 0 });
        expect(at(app, row('a')).model).toMatchObject({ edits: 1 });
      }),
    ));

  it('a change runs none of the Child’s rules, and keeps the Instance while they say the same', () =>
    run(
      Effect.gen(function* () {
        const app = yield* scoped(List);
        const [a, b, c] = ['a', 'b', 'c'].map((key) => at(app, row(key)));
        send(app, 'List', { _tag: 'Retitled', title: 'Mine' });
        expect(at(app, row('a'))).toBe(a);
        expect(at(app, row('b'))).toBe(b);

        send(app, 'List', { _tag: 'Selected', id: 'b' });
        expect(at(app, row('a')).props).toEqual({ selected: false });
        expect(at(app, row('b')).props).toEqual({ selected: true });
        expect(at(app, row('a')).model).toBe(a!.model);
        expect(at(app, row('b')).model).toBe(b!.model);
        expect(at(app, row('c'))).toBe(c);
        // New Props change the Child, by the parent's entry: it is another
        // value at the same Address, so it was not Invoked again.
        expect(at(app, row('a'))).not.toBe(a);
        expect(at(app, row('b'))).not.toBe(b);
        // Only the parent's Message is in the History.
        expect(line(app).map((entry) => entry.message._tag)).toEqual([
          'Retitled',
          'Selected',
        ]);
      }),
    ));

  it("flow on down through a Child's own invoke", () =>
    run(
      Effect.gen(function* () {
        const app = yield* scoped(List);
        expect(at(app, `${row('b')}/cell#1`).props).toEqual({ lit: false });
        send(app, 'List', { _tag: 'Selected', id: 'b' });
        expect(at(app, `${row('b')}/cell#1`).props).toEqual({ lit: true });
        expect(at(app, `${row('a')}/cell#1`).props).toEqual({ lit: false });
      }),
    ));

  it('start and stop the Workers whose Condition reads them', () =>
    run(
      Effect.gen(function* () {
        const app = yield* scoped(List);
        const running = (key: string) =>
          app.at(row(key))!.workers.map(({ name }) => name);
        expect(running('a')).toEqual(['poll']);
        expect(running('b')).toEqual([]);
        send(app, 'List', { _tag: 'Selected', id: 'b' });
        expect(running('a')).toEqual([]);
        expect(running('b')).toEqual(['poll']);
        yield* TestClock.adjust('25 millis');
        expect(at(app, row('b')).model).toMatchObject({ ticks: 2 });
        expect(line(app).at(-1)!.from).toEqual({
          kind: 'worker',
          instance: row('b'),
          name: 'poll',
        });
      }),
    ));

  it('are worked out again by Replay, never kept in the History', () =>
    run(
      Effect.gen(function* () {
        const app = yield* scoped(List);
        send(app, 'List', { _tag: 'Selected', id: 'c' });
        send(app, row('c'), { _tag: 'Edited' });
        send(app, 'List', { _tag: 'Selected', id: 'a' });
        const saved = History.save(List, historyOf(app));
        expect(History.snapshot(List, History.load(List, saved))).toEqual(
          app.snapshot,
        );
        expect(JSON.stringify(saved.entries)).not.toContain('selected"');
      }),
    ));

  it('are checked against their Schema', () => {
    const Bad = Actor.define('Bad', {}).build({
      children: {
        row: Actor.child(Row, {
          input: () => ({ text: 'x' }),
          props: () => ({ selected: 'yes' as never }),
        }),
      },
    });
    expect(() => Snapshot.init(Bad)).toThrow(
      /Row: the Props of Bad\/row#1 does not match its Schema/,
    );
  });
});

describe('the History', () => {
  it('holds only the entry, from outside the tree unless a View says so', () =>
    run(
      Effect.gen(function* () {
        const app = yield* scoped(List);
        send(app, 'List', { _tag: 'Retitled', title: 'x' });
        send(
          app,
          row('a'),
          { _tag: 'Edited' },
          { kind: 'view', instance: row('a') },
        );
        expect(line(app)).toEqual([
          {
            id: 0,
            parent: null,
            to: 'List',
            message: { _tag: 'Retitled', title: 'x' },
            from: { kind: 'outside' },
            at: 0,
          },
          {
            id: 1,
            parent: 0,
            to: row('a'),
            message: { _tag: 'Edited' },
            from: { kind: 'view', instance: row('a') },
            at: 0,
          },
        ]);
      }),
    ));

  it('says what came of each entry, worked out, on a saved History too', () =>
    run(
      Effect.gen(function* () {
        const app = yield* scoped(List);
        send(app, 'List', { _tag: 'Retitled', title: 'x' });
        send(app, row('b'), { _tag: 'Edited' });
        send(app, 'List', { _tag: 'Selected', id: 'b' });
        // From outside, a Message for an Instance that is not there plays no
        // entry: this one is written into the History by hand.
        expect(send(app, row('zzz'), { _tag: 'Edited' })).toBe('refused');
        const live = History.add(historyOf(app), {
          to: row('zzz'),
          message: { _tag: 'Edited' },
          from: { kind: 'outside' },
          at: 0,
        });
        const outcomes = (history: History) =>
          History.entries(history).map(
            (entry) =>
              Snapshot.next(
                List,
                History.snapshot(List, history, entry.parent),
                entry,
              ).outcome,
          );
        expect(outcomes(live)).toEqual([
          'handled',
          'handled',
          'handled',
          'dropped',
        ]);
        const saved = History.load(List, History.save(List, live));
        expect(outcomes(saved)).toEqual(outcomes(live));
      }),
    ));

  it('Replay warns of a Message that no longer fits, once, and skips it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const entries: ReadonlyArray<Entry> = [
      {
        to: row('a'),
        message: { _tag: 'Renamed' },
        from: { kind: 'outside' },
        at: 0,
      },
      {
        to: row('a'),
        message: { _tag: 'Edited' },
        from: { kind: 'outside' },
        at: 0,
      },
    ];
    const history = History.add(History.init(Snapshot.init(List)), entries);
    const snapshot = History.snapshot(List, history);
    // Played a second time, on the way to the first entry alone.
    History.snapshot(List, history, 0);
    expect(Snapshot.at(snapshot, row('a'))!.model).toMatchObject({
      edits: 1,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('diverged at entry 0');
    // Played on its own, it throws: Replay skips it, so it changed nothing.
    expect(() => Snapshot.next(List, Snapshot.init(List), entries[0]!)).toThrow(
      /does not match its Schema/,
    );
  });
});

// Types ---------------------------------------------------------------------------------

export const types = () => [
  Actor.define('NeedsProps', {}).build({
    children: {
      rows: Actor.child(Row, {
        // @ts-expect-error a Child that declares Props must be handed them
        each: () => ['a'],
        input: () => ({ text: 'a' }),
      }),
    },
  }),
  Actor.define('WrongProps', {}).build({
    children: {
      // @ts-expect-error its Props must be the ones its Actor declares
      cell: Actor.child(Cell, { props: () => ({ lit: 'yes' }) }),
    },
  }),
  Actor.define('Reads', {
    props: Schema.Struct({ n: Schema.Number }),
    message: Schema.TaggedUnion({ Go: {} }),
  }).build({
    on: {
      // @ts-expect-error Props are read, never given back
      Go: (_, { props }) => ({ props: { n: props.n + 1 } }),
    },
  }),
];
