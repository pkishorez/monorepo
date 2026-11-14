import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { Actor, Command, Snapshot } from '../index.ts';
import type { Address } from '../index.ts';
import { heard, run, scoped, settle } from './fixtures.ts';

/*
 * Finding an Instance by its Address: in the Snapshot, from outside, and in
 * the live tree a Command or a Query runs in. Slots and keys that start
 * like one another, the same key in two slots, a Child held alone or in a
 * list, at the top or in a State, and text that only starts like an
 * Address each find exactly what they name.
 */

const answer = Command.make('answer', {
  run: () => Effect.succeed({ _tag: 'Answered' as const }),
});

const Item = Actor.define('Item', {
  model: Schema.Struct({ count: Schema.Number, answered: Schema.Boolean }),
  message: Schema.TaggedUnion({ Bumped: {}, Asked: {}, Answered: {} }),
  queries: { count: { result: Schema.Number } },
}).build({
  init: () => ({ model: { count: 0, answered: false } }),
  on: {
    Bumped: (_, { model }) => ({ model: { ...model, count: model.count + 1 } }),
    Asked: () => ({ command: answer() }),
    Answered: (_, { model }) => ({ model: { ...model, answered: true } }),
  },
  queries: {
    count: (self) => Effect.map(self.get, ({ model }) => model.count),
  },
  workers: {
    alive: {
      run: (self) =>
        Effect.sync(() => heard.push(`start ${self.id}`)).pipe(
          Effect.andThen(
            Effect.addFinalizer(() =>
              Effect.sync(() => heard.push(`stop ${self.id}`)),
            ),
          ),
          Effect.andThen(Effect.never),
        ),
    },
  },
});

const Branch = Actor.define('Branch', {}).build({
  children: { rows: Actor.child(Item, { each: () => ['x', 'xy'] }) },
});

const Tree = Actor.define('Tree', {
  model: Schema.Struct({ ids: Schema.Array(Schema.String) }),
  state: Schema.TaggedUnion({ Open: {}, Shut: {} }),
  message: Schema.TaggedUnion({ Set: { ids: Schema.Array(Schema.String) } }),
}).build({
  init: () => ({
    model: { ids: ['x', 'xy', 'a b'] },
    state: { _tag: 'Open' },
  }),
  children: {
    a: Actor.child(Item, { each: ({ model }) => model.ids }),
    ab: Actor.child(Item, { each: ({ model }) => model.ids }),
    one: Actor.child(Item),
    branches: Actor.child(Branch, { each: () => ['p', 'q'] }),
  },
  on: { Set: ({ ids }, { model }) => ({ model: { ...model, ids } }) },
  states: { Open: { children: { inner: Actor.child(Item) } } },
});

const DEEP = 'Tree/branches[p]#1/rows[xy]#1';

/** Text written by hand as an Address, typed as an Item's. */
const item = (text: string) => text as Address<typeof Item>;

/** Text and the Address of what it finds; none for text that names nothing there. */
const CASES: ReadonlyArray<readonly [string, string | undefined]> = [
  ['Tree', 'Tree'],
  ['Tree/a[x]#1', 'Tree/a[x]#1'],
  ['Tree/a[xy]#1', 'Tree/a[xy]#1'],
  ['Tree/ab[x]#1', 'Tree/ab[x]#1'],
  ['Tree/a[a%20b]#1', 'Tree/a[a%20b]#1'],
  ['Tree/one#1', 'Tree/one#1'],
  ['Tree/branches[q]#1', 'Tree/branches[q]#1'],
  ['Tree/Open:inner#1', 'Tree/Open:inner#1'],
  [DEEP, DEEP],
  // Only the start of a real Address, or one with more after it.
  ['Tre', undefined],
  ['TreeX', undefined],
  ['Tree/', undefined],
  ['Tree/a', undefined],
  ['Tree/a[x', undefined],
  ['Tree/a[x]#', undefined],
  ['Tree/a[x]#10', undefined],
  ['Tree/on', undefined],
  ['Tree/one', undefined],
  ['Tree/one#11', undefined],
  [`${DEEP}/`, undefined],
  [`${DEEP}0`, undefined],
  // A key not held, a key on a Child held alone, none on one in a list.
  ['Tree/a[z]#1', undefined],
  ['Tree/a[a b]#1', undefined],
  ['Tree/one[x]#1', undefined],
  ['Tree/a#1', undefined],
  // At the top said to be in a State, in a State said to be at the top or in another.
  ['Tree/Open:one#1', undefined],
  ['Tree/inner#1', undefined],
  ['Tree/Shut:inner#1', undefined],
  // Another root, and slots no Instance has of its own.
  ['Other/one#1', undefined],
  ['Tree/constructor#1', undefined],
  ['Tree/a[x]#1/toString#1', undefined],
];

describe('finding an Instance by its Address', () => {
  it('finds exactly what the Address names, in the Snapshot and from outside', () =>
    run(
      Effect.gen(function* () {
        const snapshot = Snapshot.init(Tree);
        const running = yield* scoped(Tree);
        for (const [text, found] of CASES) {
          expect(Snapshot.at(snapshot, item(text))?.address, text).toBe(found);
          expect(running.at(item(text))?.address, text).toBe(found);
        }
        expect(Snapshot.at(snapshot, item('Tree/ab[x]#1'))).not.toBe(
          Snapshot.at(snapshot, item('Tree/a[x]#1')),
        );
      }),
    ));

  it('changes a Child in a list into a new list, every other Instance the same object', () => {
    const play = (snapshot: Snapshot<typeof Tree>, to: string) =>
      Snapshot.next(Tree, snapshot, {
        to: item(to),
        message: { _tag: 'Bumped' },
        from: { kind: 'outside' },
        at: 1,
      }).snapshot;
    const first = Snapshot.init(Tree);
    const bumped = play(first, 'Tree/a[xy]#1');
    const [x, xy, ab] = first.root.children.a;
    const after = bumped.root.children.a;
    expect(after).not.toBe(first.root.children.a);
    expect(after[0]).toBe(x);
    expect(after[1]).not.toBe(xy);
    expect(after[1]!.model.count).toBe(1);
    expect(after[2]).toBe(ab);
    expect(bumped.root.children.ab).toBe(first.root.children.ab);
    expect(bumped.root.children.one).toBe(first.root.children.one);
    // The copy is found by its Address as the list was.
    expect(play(bumped, 'Tree/a[xy]#1').root.children.a[1]!.model.count).toBe(
      2,
    );

    const deep = play(first, DEEP);
    const [p, q] = first.root.children.branches;
    const [px, pxy] = p!.children.rows;
    const [p2, q2] = deep.root.children.branches;
    expect(deep.root.children.branches).not.toBe(first.root.children.branches);
    expect(q2).toBe(q);
    expect(p2!.children.rows).not.toBe(p!.children.rows);
    expect(p2!.children.rows[0]).toBe(px);
    expect(p2!.children.rows[1]).not.toBe(pxy);
    expect(deep.root.children.a).toBe(first.root.children.a);
  });

  it('runs a Command and answers a Query deep in lists, at that Instance alone', () =>
    run(
      Effect.orDie(
        Effect.gen(function* () {
          const running = yield* scoped(Tree);
          const deep = running.at(item(DEEP))!;
          const near = running.at(item('Tree/branches[p]#1/rows[x]#1'))!;
          deep.send({ _tag: 'Bumped' });
          deep.send({ _tag: 'Asked' });
          yield* settle;
          expect(deep.model).toEqual({ count: 1, answered: true });
          expect(near.model).toEqual({ count: 0, answered: false });
          expect(yield* deep.queries.count()).toBe(1);
          expect(yield* near.queries.count()).toBe(0);
        }),
      ),
    ));
});

describe('the live tree following a list of Children', () => {
  it('starts what came, stops what went and keeps the rest, in order, as the keys are added, removed and moved', () =>
    run(
      Effect.orDie(
        Effect.gen(function* () {
          const running = yield* scoped(Tree);
          yield* settle;
          heard.length = 0;
          running.at(item('Tree/a[x]#1'))!.send({ _tag: 'Bumped' });
          yield* settle;
          expect(heard).toEqual([]);

          running.root.send({ _tag: 'Set', ids: ['a b', 'w', 'x'] });
          yield* settle;
          expect(heard).toEqual([
            'stop Tree/a[xy]#1',
            'stop Tree/ab[xy]#1',
            'start Tree/a[w]#1',
            'start Tree/ab[w]#1',
          ]);
          expect(running.root.children.a.map((item) => item.key)).toEqual([
            'a b',
            'w',
            'x',
          ]);
          const x = running.at(item('Tree/a[x]#1'))!;
          expect(x.model.count).toBe(1);
          x.send({ _tag: 'Bumped' });
          expect(yield* x.queries.count()).toBe(2);
          expect(running.at(item('Tree/a[xy]#1'))).toBeUndefined();

          heard.length = 0;
          running.root.send({ _tag: 'Set', ids: ['x', 'w', 'a b'] });
          running.root.send({ _tag: 'Set', ids: ['x', 'w', 'a b', 'xy'] });
          yield* settle;
          expect(heard).toEqual(['start Tree/a[xy]#2', 'start Tree/ab[xy]#2']);
          expect(yield* x.queries.count()).toBe(2);
        }),
      ),
    ));
});
