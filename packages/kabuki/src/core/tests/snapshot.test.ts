import { Effect, Option, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { Actor, Address, History, Snapshot } from '../index.ts';
import type { Entry, Instance, SavedSnapshot } from '../types.ts';
import { Board, Counter, run, historyOf, scoped, seek } from './fixtures.ts';

/*
 * A Snapshot: the app as data, and its Time. One entry gives the next
 * Snapshot, changing only the Instances on its way; an Instance's story is
 * its entries along the History, and the Snapshots after them; and a
 * Snapshot is saved as JSON and loaded again, if it still fits the code.
 */

const Shelf = Actor.define('Shelf', {
  model: Schema.Struct({ open: Schema.Boolean, title: Schema.String }),
  message: Schema.TaggedUnion({
    Opened: {},
    Closed: {},
    Retitled: { title: Schema.String },
  }),
}).build({
  init: () => ({ model: { open: false, title: '' } }),
  children: {
    counter: Actor.child(Counter, { while: ({ model }) => model.open }),
  },
  on: {
    Opened: (_, { model }) => ({ model: { ...model, open: true } }),
    Closed: (_, { model }) => ({ model: { ...model, open: false } }),
    Retitled: ({ title }, { model }) => ({ model: { ...model, title } }),
  },
});

const COUNTER = Address.check(Shelf, 'Shelf/counter#1')!;

const ROOT = Snapshot.init(Shelf).root.address;

/** A History of Messages to the Shelf and its Counter, the n-th Sent at Time n. */
const story = (
  ...sends: ReadonlyArray<
    readonly [Address, { readonly _tag: string; readonly title?: string }]
  >
) =>
  History.add(
    History.init(Snapshot.init(Shelf)),
    sends.map(([to, message], n) => ({
      to,
      message,
      from: { kind: 'outside' as const },
      at: n + 1,
    })),
  );

/** The entries of a History for one Instance, by id. */
const sentTo = (
  history: History,
  address: Address,
  to: number | null = history.head,
) =>
  History.entries(history, to)
    .filter((entry) => entry.to === address)
    .map((entry) => entry.id);

describe('a Snapshot', () => {
  it('is the app right after init, at Time 0, each Instance holding only its data', () => {
    const { root, at } = Snapshot.init(Shelf);
    expect(at).toBe(0);
    expect(root).toEqual({
      _tag: root.state._tag,
      address: 'Shelf',
      actor: 'Shelf',
      state: { _tag: root.state._tag },
      model: { open: false, title: '' },
      children: {},
      invoked: {},
    });
    // The same value each time it is asked.
    expect(Snapshot.init(Shelf)).toBe(Snapshot.init(Shelf));
  });

  it('is changed by an entry only on its way: every other Instance stays the same object', () => {
    const play = (
      snapshot: Snapshot<typeof Shelf>,
      at: number,
      to: Address,
      message: { readonly _tag: string; readonly title?: string },
    ) =>
      Snapshot.next(Shelf, snapshot, {
        to,
        message,
        from: { kind: 'outside' },
        at,
      }).snapshot;
    const first = Snapshot.init(Shelf);
    const opened = play(first, 1, ROOT, { _tag: 'Opened' });
    const bumped = play(opened, 2, COUNTER, { _tag: 'Bumped' });
    const retitled = play(bumped, 3, ROOT, { _tag: 'Retitled', title: 'mine' });
    // Its Time is the Time of the last entry played.
    expect([first.at, opened.at, bumped.at, retitled.at]).toEqual([0, 1, 2, 3]);
    expect(retitled.root.model).toEqual({ open: true, title: 'mine' });
    // The first entry started the Counter, and the second changed it, and the Shelf that holds it.
    expect(Snapshot.at(first, COUNTER)).toBeUndefined();
    expect(Snapshot.at(opened, COUNTER)?.model).toEqual({ count: 0 });
    expect(Snapshot.at(bumped, COUNTER)?.model).toEqual({ count: 1 });
    expect(bumped.root).not.toBe(opened.root);
    expect(bumped.root.model).toBe(opened.root.model);
    // The third was for the Shelf alone.
    expect(retitled.root).not.toBe(bumped.root);
    expect(Snapshot.at(retitled, COUNTER)).toBe(Snapshot.at(bumped, COUNTER));
    // An entry that changes nothing keeps the whole tree, and moves only the Time.
    const quiet = play(retitled, 4, ROOT, { _tag: 'Opened' });
    expect(quiet.root).toBe(retitled.root);
    expect(quiet.at).toBe(4);
    // Every Snapshot it was played from is as it was.
    expect(first).toEqual(Snapshot.init(Shelf));
    expect(Snapshot.at(opened, COUNTER)?.model).toEqual({ count: 0 });
  });

  it('next says what came of an entry, and keeps the tree when nothing changed', () => {
    const first = Snapshot.init(Shelf);
    const entry = (
      message: { readonly _tag: string },
      to: Address = ROOT,
    ): Entry => ({
      to,
      message,
      from: { kind: 'outside' },
      at: 7,
    });
    const handled = Snapshot.next(Shelf, first, entry({ _tag: 'Opened' }));
    expect(handled.outcome).toBe('handled');
    expect(handled.snapshot.at).toBe(7);
    expect(handled.snapshot.root.children.counter?.address).toBe(COUNTER);
    // The Snapshot it was given is as it was.
    expect(first).toEqual(Snapshot.init(Shelf));
    const dropped = Snapshot.next(
      Shelf,
      first,
      entry({ _tag: 'Bumped' }, COUNTER),
    );
    expect(dropped.outcome).toBe('dropped');
    expect(dropped.snapshot.root).toBe(first.root);
    expect(dropped.snapshot.at).toBe(7);
    expect(dropped.commands).toEqual([]);
    expect(dropped.emitted).toEqual([]);
  });
});

describe("an Instance's story", () => {
  it('is its entries along the History, and the Snapshots after them', () => {
    const history = story(
      [ROOT, { _tag: 'Opened' }],
      [COUNTER, { _tag: 'Bumped' }],
      [ROOT, { _tag: 'Retitled', title: 'x' }],
      [ROOT, { _tag: 'Closed' }],
      [ROOT, { _tag: 'Opened' }],
    );
    const counterAfter = (entry: number | null) =>
      Snapshot.at(History.snapshot(Shelf, history, entry), COUNTER);
    expect(sentTo(history, COUNTER)).toEqual([1]);
    // Started by 0, changed by 1, untouched by 2, stopped by 3.
    expect(counterAfter(null)).toBeUndefined();
    expect(counterAfter(0)?.model).toEqual({ count: 0 });
    expect(counterAfter(1)?.model).toEqual({ count: 1 });
    expect(counterAfter(2)).toEqual(counterAfter(1));
    expect(counterAfter(3)).toBeUndefined();
    expect(counterAfter(4)).toBeUndefined();
    // The Counter Invoked again is another Instance, with its own story.
    const again = Address.check(Shelf, 'Shelf/counter#2')!;
    expect(sentTo(history, again)).toEqual([]);
    expect(
      Snapshot.at(History.snapshot(Shelf, history, 3), again),
    ).toBeUndefined();
    expect(Snapshot.at(History.snapshot(Shelf, history), again)?.model).toEqual(
      { count: 0 },
    );
  });

  it('starts at the start for an Instance there since, and tells a Message that changed nothing', () => {
    const history = story(
      [ROOT, { _tag: 'Closed' }],
      [ROOT, { _tag: 'Retitled', title: 'x' }],
    );
    expect(sentTo(history, ROOT)).toEqual([0, 1]);
    const start = History.snapshot(Shelf, history, null);
    expect(start.root).toBe(history.start.root);
    // The first changed nothing; the second did.
    expect(History.snapshot(Shelf, history, 0).root).toBe(start.root);
    expect(History.snapshot(Shelf, history, 1).root).not.toBe(start.root);
    expect(History.snapshot(Shelf, history, 1).root.model.title).toBe('x');
  });

  it('is read up to any entry, as a Runtime played it', () =>
    run(
      Effect.gen(function* () {
        const app = yield* scoped(Shelf);
        app.root.send({ _tag: 'Opened' });
        app.at(COUNTER)?.send({ _tag: 'Bumped' });
        app.at(COUNTER)?.send({ _tag: 'Bumped' });
        expect(sentTo(historyOf(app), COUNTER)).toEqual([1, 2]);
        expect(sentTo(historyOf(app), COUNTER, 1)).toEqual([1]);
        expect(Snapshot.at(seek(app, 1), COUNTER)?.model).toEqual({
          count: 1,
        });
        expect(Snapshot.at(seek(app, 2), COUNTER)?.model).toEqual({
          count: 2,
        });
        expect(Snapshot.at(seek(app, null), COUNTER)).toBeUndefined();
        expect(sentTo(historyOf(app), COUNTER, null)).toEqual([]);
        // Replayed from the Messages alone, it is what the Runtime holds.
        expect(seek(app, 2)).toEqual(app.snapshot);
      }),
    ));
});

describe('a saved Snapshot', () => {
  const through = (saved: SavedSnapshot): SavedSnapshot =>
    JSON.parse(JSON.stringify(saved));

  /** The Shelf open, its Counter at 1, at Time 3. */
  const open = History.snapshot(
    Shelf,
    story(
      [ROOT, { _tag: 'Opened' }],
      [COUNTER, { _tag: 'Bumped' }],
      [ROOT, { _tag: 'Retitled', title: 'mine' }],
    ),
  );

  it('loads again to the same Snapshot, through JSON', () => {
    const saved = Snapshot.save(Shelf, open);
    expect(through(saved)).toEqual(saved);
    expect(Object.keys(saved).sort()).toEqual(['at', 'root']);
    expect(saved.at).toBe(3);
    const loaded = Snapshot.load(Shelf, through(saved));
    expect(loaded).toEqual(open);
    expect(Snapshot.at(loaded, COUNTER)?.model).toEqual({ count: 1 });
    // Saved again, it is the same JSON; and it plays on as the one it was saved from.
    expect(Snapshot.save(Shelf, loaded)).toEqual(saved);
    const closed: Entry = {
      to: ROOT,
      message: { _tag: 'Closed' },
      from: { kind: 'outside' },
      at: 4,
    };
    expect(Snapshot.next(Shelf, loaded, closed)).toEqual(
      Snapshot.next(Shelf, open, closed),
    );
  });

  it('never changes once given: the same object for the same Snapshot', () => {
    const saved = Snapshot.save(Shelf, open);
    expect(Snapshot.save(Shelf, open)).toBe(saved);
    expect(Object.isFrozen(saved)).toBe(true);
    expect(Snapshot.save(Shelf, Snapshot.init(Shelf))).not.toBe(saved);
  });

  it('holds each value as its Schema encodes it, in every Instance', () => {
    const Note = Schema.Struct({
      at: Schema.DateFromString,
      text: Schema.OptionFromNullOr(Schema.String),
    });
    const Page = Actor.define('Page', {
      model: Schema.Struct({ note: Note }),
    }).build({
      init: () => ({
        model: { note: { at: new Date(7), text: Option.none() } },
      }),
    });
    const Diary = Actor.define('Diary', {
      model: Schema.Struct({ notes: Schema.Array(Note) }),
    }).build({
      init: () => ({
        model: { notes: [{ at: new Date(5), text: Option.some('kept') }] },
      }),
      children: { page: Actor.child(Page) },
    });
    const snapshot = Snapshot.init(Diary);
    const saved = through(Snapshot.save(Diary, snapshot));
    expect(saved.root.model).toEqual({
      notes: [{ at: new Date(5).toISOString(), text: 'kept' }],
    });
    expect((saved.root.children.page as Instance).model).toEqual({
      note: { at: new Date(7).toISOString(), text: null },
    });
    // In memory, every value is decoded again.
    expect(Snapshot.load(Diary, saved)).toEqual(snapshot);
  });

  describe('that no longer fits the code throws when loaded, saying why', () => {
    const saved = Snapshot.save(Shelf, open);
    const fits = /the saved Snapshot no longer fits Shelf/;

    it('with a State its Actor no longer has', () => {
      const stale = {
        ...saved,
        root: { ...saved.root, _tag: 'Gone', state: { _tag: 'Gone' } },
      };
      expect(() => Snapshot.load(Shelf, stale)).toThrow(fits);
      expect(() => Snapshot.load(Shelf, stale)).toThrow(/Gone/);
    });

    it('with a `_tag` that is not its State', () => {
      const stale = { ...saved, root: { ...saved.root, _tag: 'Other' } };
      expect(() => Snapshot.load(Shelf, stale)).toThrow(fits);
      expect(() => Snapshot.load(Shelf, stale)).toThrow(
        /Shelf says it is in Other/,
      );
    });

    it('with a Model that does not match its Schema, in any Instance', () => {
      const stale = {
        ...saved,
        root: { ...saved.root, model: { open: true, title: 7 } },
      };
      expect(() => Snapshot.load(Shelf, stale)).toThrow(fits);
      const counter = saved.root.children.counter as Instance;
      const below = {
        ...saved,
        root: {
          ...saved.root,
          children: { counter: { ...counter, model: { count: 'many' } } },
        },
      };
      expect(() => Snapshot.load(Shelf, below)).toThrow(fits);
    });

    it('with a Child ahead of what its parent has Invoked', () => {
      const ahead = { ...saved, root: { ...saved.root, invoked: {} } };
      expect(() => Snapshot.load(Shelf, ahead)).toThrow(
        /Shelf has Invoked "counter" 0 times, but holds Shelf\/counter#1/,
      );
      expect(
        Snapshot.load(Shelf, { ...saved, root: { ...saved.root } }),
      ).toEqual(open);
    });

    it('with a Child its State does not Invoke, or without one it always does', () => {
      const board = Snapshot.save(Board, Snapshot.init(Board));
      const none = { ...board, root: { ...board.root, children: {} } };
      expect(() => Snapshot.load(Board, none)).toThrow(/holds no such Child/);
      const { left } = board.root.children;
      const more = {
        ...board,
        root: {
          ...board.root,
          children: { ...board.root.children, top: left! },
        },
      };
      expect(() => Snapshot.load(Board, more)).toThrow(
        /Board has no Child "top"/,
      );
    });

    it("with another Actor's root, or none", () => {
      expect(() => Snapshot.load(Counter, saved)).toThrow(
        /the saved Snapshot no longer fits Counter/,
      );
      expect(() => Snapshot.load(Shelf, {} as SavedSnapshot)).toThrow(
        /the saved Snapshot is corrupt: it has no root/,
      );
    });

    it('with code that changed since: a Model of another shape', () => {
      const Renamed = Actor.define('Shelf', {
        model: Schema.Struct({ open: Schema.Boolean, name: Schema.String }),
      }).build({ init: () => ({ model: { open: false, name: '' } }) });
      expect(() => Snapshot.load(Renamed, saved)).toThrow(fits);
      // Nothing is taken from it: the code as it is now still makes its own.
      expect(Snapshot.init(Renamed).root.model).toEqual({
        open: false,
        name: '',
      });
    });
  });
});
