import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { Actor, Address, Snapshot } from '../index.ts';
import { Counter, run, scoped } from './fixtures.ts';

/*
 * `Snapshot.changes` says what changed from one Snapshot to another, per
 * Address: Instances added and removed, whole, and the State, Model, Props
 * and wanted Workers of the ones kept. Parts that are the same object in
 * both are never walked.
 */

const Item = Actor.define('Item', {
  props: { lit: Schema.Boolean },
  model: { count: Schema.Number },
  message: { Bumped: {} },
}).build({
  init: () => ({ model: { count: 0 } }),
  children: { badge: Actor.child(Counter) },
  on: { Bumped: (_, { model }) => ({ model: { count: model.count + 1 } }) },
  workers: {
    glow: { while: ({ props }) => props.lit, run: () => Effect.never },
  },
});

const Desk = Actor.define('Desk', {
  model: {
    ids: Schema.Array(Schema.String),
    lit: Schema.String,
    title: Schema.String,
    open: Schema.Boolean,
    uploads: Schema.Array(Schema.String),
  },
  state: { Working: { step: Schema.Number }, Away: {} },
  message: {
    Added: { id: Schema.String },
    Dropped: { id: Schema.String },
    Lit: { id: Schema.String },
    Retitled: { title: Schema.String },
    Opened: {},
    Closed: {},
    Uploaded: { ids: Schema.Array(Schema.String) },
    Stepped: { step: Schema.Number },
    Left: {},
    Back: {},
  },
}).build({
  init: () => ({
    model: { ids: ['a', 'b'], lit: 'a', title: '', open: false, uploads: [] },
    state: { _tag: 'Working', step: 1 },
  }),
  children: {
    items: Actor.child(Item, {
      each: ({ model }) => model.ids,
      props: ({ model }, id) => ({ lit: id === model.lit }),
    }),
    drawer: Actor.child(Counter, { while: ({ model }) => model.open }),
  },
  workers: {
    upload: { each: ({ model }) => model.uploads, run: () => Effect.never },
  },
  on: {
    Added: ({ id }, { model }) => ({ model: { ids: [...model.ids, id] } }),
    Dropped: ({ id }, { model }) => ({
      model: { ids: model.ids.filter((one) => one !== id) },
    }),
    Lit: ({ id }) => ({ model: { lit: id } }),
    Retitled: ({ title }) => ({ model: { title } }),
    Opened: () => ({ model: { open: true } }),
    Closed: () => ({ model: { open: false } }),
    Uploaded: ({ ids }) => ({ model: { uploads: ids } }),
  },
  states: {
    Working: {
      children: { note: Actor.child(Counter) },
      workers: { tick: { run: () => Effect.never } },
      on: {
        Stepped: ({ step }) => ({ state: { _tag: 'Working', step } }),
        Left: () => ({ state: { _tag: 'Away' } }),
      },
    },
    Away: {
      children: { sign: Actor.child(Counter) },
      on: { Back: () => ({ state: { _tag: 'Working', step: 1 } }) },
    },
  },
});

const address = (text: string) => Address.check(Desk, text)!;
const DESK = address('Desk');

type Message = { readonly _tag: string; readonly [field: string]: unknown };

/** The Snapshot after each Message in turn, to the Desk unless an Address is given. */
const play = (
  snapshot: Snapshot<typeof Desk>,
  ...messages: ReadonlyArray<Message | readonly [Address, Message]>
) =>
  messages.reduce((now, sent, n) => {
    const [to, message] = Array.isArray(sent) ? sent : [DESK, sent];
    return Snapshot.next(Desk, now, {
      to,
      message,
      from: { kind: 'outside' },
      at: now.at + n + 1,
    }).snapshot;
  }, snapshot);

const first = Snapshot.init(Desk);

/** What one Message to the Desk changed, from `before`. */
const changed = (before: Snapshot<typeof Desk>, message: Message) =>
  Snapshot.changes(Desk, before, play(before, message));

const NONE = { started: [], stopped: [] };

describe('Snapshot.changes', () => {
  it('is empty when nothing changed', () => {
    expect(Snapshot.changes(Desk, first, first)).toEqual([]);
    expect(changed(first, { _tag: 'Retitled', title: '' })).toEqual([]);
    // Another object with the same data changes nothing either.
    expect(
      Snapshot.changes(Desk, first, {
        ...first,
        root: { ...first.root, model: { ...first.root.model } },
      }),
    ).toEqual([]);
  });

  it('says each Model field that differs, before and after', () => {
    expect(changed(first, { _tag: 'Retitled', title: 'mine' })).toEqual([
      {
        _tag: 'Changed',
        address: DESK,
        actor: 'Desk',
        model: { title: { before: '', after: 'mine' } },
        props: {},
        workers: NONE,
      },
    ]);
  });

  it('says a State that differs, and whether its tag did: a Transition', () => {
    expect(changed(first, { _tag: 'Stepped', step: 2 })).toEqual([
      {
        _tag: 'Changed',
        address: DESK,
        actor: 'Desk',
        state: {
          before: { _tag: 'Working', step: 1 },
          after: { _tag: 'Working', step: 2 },
          transition: false,
        },
        model: {},
        props: {},
        workers: NONE,
      },
    ]);
    // The same State again, as a new object, is no change.
    expect(changed(first, { _tag: 'Stepped', step: 1 })).toEqual([]);

    // A Transition stops the State's Workers, and replaces its Children.
    const away = changed(first, { _tag: 'Left' });
    expect(away).toEqual([
      {
        _tag: 'Changed',
        address: DESK,
        actor: 'Desk',
        state: {
          before: { _tag: 'Working', step: 1 },
          after: { _tag: 'Away' },
          transition: true,
        },
        model: {},
        props: {},
        workers: { started: [], stopped: [{ name: 'tick' }] },
      },
      {
        _tag: 'Removed',
        address: address('Desk/Working:note#1'),
        actor: 'Counter',
        state: { _tag: 'Single' },
        model: { count: 0 },
        workers: [],
      },
      {
        _tag: 'Added',
        address: address('Desk/Away:sign#1'),
        actor: 'Counter',
        state: { _tag: 'Single' },
        model: { count: 0 },
        workers: [],
      },
    ]);
  });

  it('shows an Instance Invoked again as removed and added, at its new Address', () => {
    const away = play(first, { _tag: 'Left' });
    const back = Snapshot.changes(Desk, away, play(away, { _tag: 'Back' }));
    expect(back.map(({ _tag, address }) => [_tag, address])).toEqual([
      ['Changed', DESK],
      ['Removed', 'Desk/Away:sign#1'],
      ['Added', 'Desk/Working:note#2'],
    ]);
  });

  it('says each Props field handed to a Child that differs, and the Workers it asks for now', () => {
    const lit = changed(first, { _tag: 'Lit', id: 'b' });
    expect(lit).toEqual([
      {
        _tag: 'Changed',
        address: DESK,
        actor: 'Desk',
        model: { lit: { before: 'a', after: 'b' } },
        props: {},
        workers: NONE,
      },
      {
        _tag: 'Changed',
        address: address('Desk/items[a]#1'),
        actor: 'Item',
        key: 'a',
        model: {},
        props: { lit: { before: true, after: false } },
        workers: { started: [], stopped: [{ name: 'glow' }] },
      },
      {
        _tag: 'Changed',
        address: address('Desk/items[b]#1'),
        actor: 'Item',
        key: 'b',
        model: {},
        props: { lit: { before: false, after: true } },
        workers: { started: [{ name: 'glow' }], stopped: [] },
      },
    ]);
  });

  it('lists a Child added or removed by `each`, and every Instance under it, whole', () => {
    const added = changed(first, { _tag: 'Added', id: 'c' });
    expect(added.slice(1)).toEqual([
      {
        _tag: 'Added',
        address: address('Desk/items[c]#1'),
        actor: 'Item',
        key: 'c',
        state: { _tag: 'Single' },
        model: { count: 0 },
        props: { lit: false },
        workers: [],
      },
      {
        _tag: 'Added',
        address: address('Desk/items[c]#1/badge#1'),
        actor: 'Counter',
        state: { _tag: 'Single' },
        model: { count: 0 },
        workers: [],
      },
    ]);

    const bumped = play(first, [
      address('Desk/items[a]#1'),
      { _tag: 'Bumped' },
    ]);
    const dropped = changed(bumped, { _tag: 'Dropped', id: 'a' });
    expect(dropped.slice(1)).toEqual([
      {
        _tag: 'Removed',
        address: address('Desk/items[a]#1'),
        actor: 'Item',
        key: 'a',
        state: { _tag: 'Single' },
        model: { count: 1 },
        props: { lit: true },
        workers: [{ name: 'glow' }],
      },
      {
        _tag: 'Removed',
        address: address('Desk/items[a]#1/badge#1'),
        actor: 'Counter',
        state: { _tag: 'Single' },
        model: { count: 0 },
        workers: [],
      },
    ]);
  });

  it('lists a Child there only `while` its test holds, added and removed', () => {
    const opened = play(first, { _tag: 'Opened' });
    const drawer = address('Desk/drawer#1');
    expect(Snapshot.changes(Desk, first, opened)[1]).toEqual({
      _tag: 'Added',
      address: drawer,
      actor: 'Counter',
      state: { _tag: 'Single' },
      model: { count: 0 },
      workers: [],
    });

    const bumped = play(opened, [drawer, { _tag: 'Bumped' }]);
    expect(Snapshot.changes(Desk, opened, bumped)).toEqual([
      {
        _tag: 'Changed',
        address: drawer,
        actor: 'Counter',
        model: { count: { before: 0, after: 1 } },
        props: {},
        workers: NONE,
      },
    ]);
    expect(changed(bumped, { _tag: 'Closed' })[1]).toEqual({
      _tag: 'Removed',
      address: drawer,
      actor: 'Counter',
      state: { _tag: 'Single' },
      model: { count: 1 },
      workers: [],
    });
    // Any two Snapshots compare, however many Messages apart.
    expect(Snapshot.changes(Desk, first, bumped)[1]).toMatchObject({
      _tag: 'Added',
      model: { count: 1 },
    });
  });

  it('says the Workers of an `each` started and stopped, by key', () => {
    const one = play(first, { _tag: 'Uploaded', ids: ['x', 'y'] });
    expect(changed(one, { _tag: 'Uploaded', ids: ['y', 'z'] })).toEqual([
      {
        _tag: 'Changed',
        address: DESK,
        actor: 'Desk',
        model: {
          uploads: { before: ['x', 'y'], after: ['y', 'z'] },
        },
        props: {},
        workers: {
          started: [{ name: 'upload', key: 'z' }],
          stopped: [{ name: 'upload', key: 'x' }],
        },
      },
    ]);
  });

  it('never walks a part that is the same object in both', () => {
    // A Child the comparison cannot read, held in both, as Next keeps one off its path.
    const untouchable = new Proxy(first.root.children.items, {
      get: () => {
        throw new Error('walked into a shared part');
      },
    });
    const { root } = first;
    const children = { ...root.children, items: untouchable };
    const before = { ...first, root: { ...root, children } };
    const after = {
      ...first,
      root: { ...root, model: { ...root.model, title: 'mine' }, children },
    };
    expect(Snapshot.changes(Desk, before, after)).toHaveLength(1);
  });
});

describe('try', () => {
  it('gives what the Message would change across the tree', () =>
    run(
      Effect.gen(function* () {
        const app = yield* scoped(Desk);
        const tried = app.root.try({ _tag: 'Opened' });
        expect(tried._tag).toBe('Changes');
        if (tried._tag !== 'Changes') return;
        expect(tried.changes).toEqual(
          Snapshot.changes(Desk, app.snapshot, tried.snapshot),
        );
        expect(
          tried.changes.map(({ _tag, address }) => [_tag, address]),
        ).toEqual([
          ['Changed', 'Desk'],
          ['Added', 'Desk/drawer#1'],
        ]);
      }),
    ));
});
