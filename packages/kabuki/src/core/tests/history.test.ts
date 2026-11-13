import { Effect, Option, Schema } from 'effect';
import type { Scope } from 'effect';
import { TestClock } from 'effect/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Actor, History, Runtime, Snapshot } from '../index.ts';
import type { Address } from '../index.ts';
import type { Entry, SavedHistory } from '../types.ts';
import { line, historyOf, scoped } from './fixtures.ts';

/*
 * The History: a plain value that starts from a Snapshot, grown, moved and
 * read by pure functions, Compacted to a Window, and saved as JSON and
 * loaded again.
 */

const Counter = Actor.define('Counter', {
  model: Schema.Struct({ count: Schema.Number }),
  state: Schema.TaggedUnion({ Idle: {}, Busy: { since: Schema.Number } }),
  message: Schema.TaggedUnion({ Bumped: {}, Started: {}, Done: {} }),
}).build({
  init: () => ({ model: { count: 0 }, state: { _tag: 'Idle' } }),
  on: {
    Bumped: (_, { model }) => ({ model: { count: model.count + 1 } }),
  },
  states: {
    Idle: {
      on: {
        Started: (_, { at }) => ({ state: { _tag: 'Busy', since: at } }),
      },
    },
    Busy: { on: { Done: () => ({ state: { _tag: 'Idle' } }) } },
  },
});

const timed = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(Effect.provide(TestClock.layer())),
  );

/** The Counter right after init: what the Histories here start from, unless said. */
const START = Snapshot.init(Counter);

const ROOT = START.root.address;

const bumped = (at = 0): Entry => ({
  to: ROOT,
  message: { _tag: 'Bumped' },
  from: { kind: 'outside' },
  at,
});

const bump = (history: History, at = 0) => History.add(history, bumped(at));

const ids = (entries: ReadonlyArray<{ readonly id: number }>) =>
  entries.map((entry) => entry.id);

const seekTo = (history: History, entry: number | null = history.head) =>
  History.snapshot(Counter, history, entry);

const count = (history: History, entry: number | null = history.head) =>
  seekTo(history, entry).root.model;

/** A History of three Messages, as a Runtime leaves it. */
const saved = (): Effect.Effect<SavedHistory, never, Scope.Scope> =>
  Effect.gen(function* () {
    const app = yield* scoped(Counter);
    yield* TestClock.adjust('100 millis');
    app.root.send({ _tag: 'Bumped' });
    yield* TestClock.adjust('100 millis');
    app.root.send({ _tag: 'Started' });
    yield* TestClock.adjust('100 millis');
    app.root.send({ _tag: 'Bumped' });
    return History.save(Counter, historyOf(app));
  });

/** A Runtime of the Counter carrying on from a History's Head, the History kept beside it as it grows. */
const carryOn = (from: History) =>
  Effect.gen(function* () {
    const kept = { history: from };
    const app = yield* Runtime.scoped(Counter, {
      snapshot: History.snapshot(Counter, from),
      running: false,
    });
    app.subscribe((entries) => {
      kept.history = History.add(kept.history, entries);
    });
    void app.start();
    return { app, kept };
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a History value', () => {
  it('grows after its Head, and leaves the History it grew from as it was', () => {
    const empty = History.init(START);
    const one = bump(empty);
    const two = bump(one);
    expect(History.all(empty)).toEqual([]);
    expect(empty.head).toBe(null);
    expect(empty.start).toBe(START);
    expect(ids(History.all(one))).toEqual([0]);
    expect(History.all(two).map((e) => [e.id, e.parent])).toEqual([
      [0, null],
      [1, 0],
    ]);
    expect(two.head).toBe(1);
    expect(two.start).toBe(START);
    expect(Object.isFrozen(two)).toBe(true);
    expect(History.all(two).every((e) => Object.isFrozen(e))).toBe(true);
    // The entries are shared, never copied.
    expect(History.all(two)[0]).toBe(History.all(one)[0]);
  });

  it('adds one entry or a list, in order, its Head at the last', () => {
    const empty = History.init(START);
    const three = History.add(empty, [bumped(1), bumped(2), bumped(3)]);
    expect(History.all(three).map((e) => [e.id, e.parent, e.at])).toEqual([
      [0, null, 1],
      [1, 0, 2],
      [2, 1, 3],
    ]);
    expect(three.head).toBe(2);
    // A list is its entries added one by one.
    const oneByOne = [1, 2, 3].reduce((h, at) => bump(h, at), empty);
    expect(History.all(three)).toEqual(History.all(oneByOne));
    expect(count(three)).toEqual({ count: 3 });
    // No entry: the same History.
    expect(History.add(three, [])).toBe(three);
    // After an entry that already has one after it, a list grows one Branch.
    const branched = History.add(History.move(three, 0), [
      bumped(4),
      bumped(5),
    ]);
    expect(ids(History.entries(branched))).toEqual([0, 3, 4]);
    expect(branched.head).toBe(4);
    // The History it grew from is untouched.
    expect(History.all(empty)).toEqual([]);
    expect(ids(History.all(three))).toEqual([0, 1, 2]);
  });

  it('branches when it grows from an entry that already has one after it', () => {
    const three = bump(bump(bump(History.init(START))));
    const back = History.move(three, 0);
    expect(back.head).toBe(0);
    expect(History.all(back)).toHaveLength(3);
    const branched = bump(back);
    expect(ids(History.entries(branched))).toEqual([0, 3]);
    expect(ids(History.children(branched, 0))).toEqual([1, 3]);
    // The History it branched from is untouched.
    expect(ids(History.entries(three))).toEqual([0, 1, 2]);
    expect(ids(History.children(three, 0))).toEqual([1]);
    // Growing either again keeps them apart.
    expect(ids(History.entries(bump(three)))).toEqual([0, 1, 2, 3]);
    expect(ids(History.entries(bump(branched)))).toEqual([0, 3, 4]);
  });

  it('reads an entry, the line to any entry, and refuses one it does not have', () => {
    const three = bump(bump(bump(History.init(START))));
    expect(History.entry(three, 1)?.parent).toBe(0);
    expect(History.entry(three, 9)).toBeUndefined();
    expect(ids(History.entries(three, 1))).toEqual([0, 1]);
    expect(History.entries(three, null)).toEqual([]);
    expect(() => History.move(three, 9)).toThrow(/no History entry 9/);
    expect(() => History.entries(three, 9)).toThrow(/no History entry 9/);
  });

  it('reads every entry on every Branch with `all`, and only the way to one with `entries`', () => {
    const three = bump(bump(bump(History.init(START))));
    // With one Branch and the Head at its end, they are the same.
    expect(History.all(three)).toEqual(History.entries(three));
    const branched = bump(bump(History.move(three, 0)));
    expect(ids(History.all(branched))).toEqual([0, 1, 2, 3, 4]);
    expect(ids(History.entries(branched))).toEqual([0, 3, 4]);
    expect(ids(History.entries(branched, 2))).toEqual([0, 1, 2]);
    // Moving the Head changes the way, never what there is.
    const back = History.move(branched, 1);
    expect(History.all(back)).toEqual(History.all(branched));
    expect(ids(History.entries(back))).toEqual([0, 1]);
    expect(History.entries(History.move(branched, null))).toEqual([]);
    expect(History.all(History.move(branched, null))).toHaveLength(5);
    // An older History does not see the entries grown after it.
    expect(ids(History.all(three))).toEqual([0, 1, 2]);
  });

  it('names the last entry of every Branch, whichever the Head is on', () => {
    expect(History.tips(History.init(START))).toEqual([]);
    const three = bump(bump(bump(History.init(START))));
    expect(ids(History.tips(three))).toEqual([2]);
    const branched = bump(bump(History.move(three, 0)));
    expect(ids(History.tips(branched))).toEqual([2, 4]);
    const fromStart = bump(History.move(branched, null));
    expect(ids(History.tips(fromStart))).toEqual([2, 4, 5]);
    // An older History does not see the entries grown after it.
    expect(ids(History.tips(three))).toEqual([2]);
    expect(ids(History.tips(History.move(branched, 1)))).toEqual([2, 4]);
  });

  it('is made only by init or load: one written by hand is refused, and saved it is plain data', () => {
    const grown = bump(bump(History.init(START)));
    const byHand: History = { start: grown.start, head: grown.head };
    expect(() => History.entries(byHand)).toThrow(/not a History/);
    expect(() => bump(byHand)).toThrow(/not a History/);
    expect(() => History.save(Counter, byHand)).toThrow(/not a History/);

    const plain = JSON.parse(JSON.stringify(History.save(Counter, grown)));
    expect(plain).toEqual({
      start: JSON.parse(JSON.stringify(Snapshot.save(Counter, START))),
      entries: JSON.parse(JSON.stringify(History.all(grown))),
      head: 1,
    });
    const loaded = History.load(Counter, plain as SavedHistory);
    expect(History.entries(loaded)).toEqual(History.entries(grown));
    expect(loaded.start).toEqual(START);
    expect(count(loaded)).toEqual({ count: 2 });
    expect(ids(History.entries(bump(loaded)))).toEqual([0, 1, 2]);
  });

  it('stays cheap to grow: ten thousand entries in well under a second', () => {
    let history = History.init(START);
    const started = performance.now();
    for (let at = 0; at < 10_000; at++) history = bump(history, at);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(history.head).toBe(9_999);
    expect(count(history)).toEqual({ count: 10_000 });
  });
});

describe('a History started from a Snapshot', () => {
  /** The Counter as it was left some time ago: Busy, at 42. */
  const left: Snapshot<typeof Counter> = {
    root: {
      ...START.root,
      _tag: 'Busy',
      model: { count: 42 },
      state: { _tag: 'Busy', since: 7 },
    },
    at: 7,
  };

  it('holds the whole tree it starts from, and plays every entry after it', () => {
    const history = History.init(left);
    expect(history.start).toBe(left);
    expect(history.head).toBe(null);
    expect(History.all(history)).toEqual([]);
    expect(History.snapshot(Counter, history)).toBe(left);

    const one = bump(history, 9);
    expect(History.snapshot(Counter, one)).toEqual({
      root: { ...left.root, model: { count: 43 } },
      at: 9,
    });
    // The start is the floor: nothing is known of what came before it.
    expect(History.snapshot(Counter, one, null)).toBe(left);
    expect(History.entry(one, 0)).toMatchObject({ id: 0, parent: null });
  });

  it('is what a Runtime carries on from, with no entry for where it starts', () =>
    timed(
      Effect.gen(function* () {
        const state = yield* saved();
        const snapshot = History.snapshot(
          Counter,
          History.load(Counter, state),
        );
        const light = History.init(snapshot);
        expect(History.all(light)).toEqual([]);
        expect(light.head).toBe(null);
        expect(light.start).toBe(snapshot);
        expect(snapshot.at).toBe(300);

        const app = yield* scoped(Counter, { snapshot });
        expect(app.snapshot).toBe(snapshot);
        expect(app.now()).toBe(300);
        expect(historyOf(app).start).toBe(snapshot);
        expect(line(app)).toHaveLength(0);
        // The start is the floor: the Snapshot it carried on from, not the Actor's own init.
        expect(count(historyOf(app), null)).toEqual({ count: 2 });
        app.root.send({ _tag: 'Done' });
        expect(app.snapshot.root.state._tag).toBe('Idle');
        expect(line(app).map((e) => e.message._tag)).toEqual(['Done']);
        expect(line(app)[0]).toMatchObject({
          id: 0,
          parent: null,
          to: 'Counter',
          at: 300,
          from: { kind: 'outside' },
        });
        // The entry holds only the Message and where it sits: what came of it is worked out.
        expect(Object.keys(line(app)[0]!).sort()).toEqual([
          'at',
          'from',
          'id',
          'message',
          'parent',
          'to',
        ]);
      }),
    ));
});

describe('a saved History', () => {
  it('carries on running at its Head, from its Time', () =>
    timed(
      Effect.gen(function* () {
        const state = yield* saved();
        const { app, kept } = yield* carryOn(History.load(Counter, state));
        expect(app.running).toBe(true);
        expect(kept.history.head).toBe(2);
        expect(app.now()).toBe(300);
        expect(app.snapshot.root.model).toEqual({ count: 2 });
        yield* TestClock.adjust('50 millis');
        app.root.send({ _tag: 'Bumped' });
        expect(History.entries(kept.history).at(-1)).toMatchObject({
          id: 3,
          parent: 2,
          at: 350,
        });
      }),
    ));

  it('is plain JSON, its start, its entries and its Head, when the encoded side of every Schema is JSON-safe', () =>
    timed(
      Effect.gen(function* () {
        const state = yield* saved();
        expect(Object.keys(state).sort()).toEqual(['entries', 'head', 'start']);
        expect(JSON.parse(JSON.stringify(state))).toEqual(state);
        expect(state.start).toBe(Snapshot.save(Counter, START));
      }),
    ));

  it('saves, Compacts and loads again to the same app, with the same Snapshots', () =>
    timed(
      Effect.gen(function* () {
        let history = History.init(START);
        for (let at = 1; at <= 6; at++) history = bump(history, at * 10);
        history = History.move(history, 3);
        history = bump(history, 99);
        const compacted = History.compact(Counter, history, 2);
        expect(ids(History.entries(compacted))).toEqual([3, 6]);
        // Only what grows from the new start stays: 4 and 5 do.
        expect(ids(History.all(compacted))).toEqual([3, 4, 5, 6]);
        expect(compacted.start).toEqual(History.snapshot(Counter, history, 2));
        const through = JSON.parse(
          JSON.stringify(History.save(Counter, compacted)),
        ) as SavedHistory;
        expect(through.start.root.model).toEqual({ count: 3 });
        const loaded = History.load(Counter, through, { onMismatch: 'fail' });
        expect(loaded.head).toBe(6);
        expect(History.snapshot(Counter, loaded)).toEqual(
          History.snapshot(Counter, history),
        );
        expect(History.snapshot(Counter, loaded, 5)).toEqual(
          History.snapshot(Counter, history, 5),
        );
        expect(History.save(Counter, loaded)).toEqual(through);
        // It carries on from its ids.
        expect(bump(loaded).head).toBe(7);
      }),
    ));

  describe('holds each value as its Schema encodes it', () => {
    const Note = Schema.Struct({
      at: Schema.DateFromString,
      text: Schema.OptionFromNullOr(Schema.String),
    });
    const Diary = Actor.define('Diary', {
      model: Schema.Struct({ notes: Schema.Array(Note) }),
      message: Schema.TaggedUnion({ Wrote: { note: Note } }),
    }).build({
      init: () => ({ model: { notes: [] } }),
      on: {
        Wrote: ({ note }, { model }) => ({
          model: { notes: [...model.notes, note] },
        }),
      },
    });
    const through = (saved: SavedHistory): SavedHistory =>
      JSON.parse(JSON.stringify(saved));

    it('so a Date or an Option in a Message comes back through JSON', () =>
      timed(
        Effect.gen(function* () {
          const app = yield* scoped(Diary);
          app.root.send({
            _tag: 'Wrote',
            note: { at: new Date(5), text: Option.some('hi') },
          });
          app.root.send({
            _tag: 'Wrote',
            note: { at: new Date(9), text: Option.none() },
          });
          const saved = through(History.save(Diary, historyOf(app)));
          expect(saved.entries.map((entry) => entry.message)).toEqual([
            {
              _tag: 'Wrote',
              note: { at: new Date(5).toISOString(), text: 'hi' },
            },
            {
              _tag: 'Wrote',
              note: { at: new Date(9).toISOString(), text: null },
            },
          ]);
          const loaded = History.load(Diary, saved);
          // In memory, every value is decoded again.
          expect(History.all(loaded)[0]!.message).toEqual(
            History.all(historyOf(app))[0]!.message,
          );
          expect(History.snapshot(Diary, loaded)).toEqual(app.snapshot);
          // Saved again, it is the same JSON.
          expect(through(History.save(Diary, loaded))).toEqual(saved);
        }),
      ));

    it("so does its start's tree", () => {
      const first = Snapshot.init(Diary);
      const snapshot: Snapshot<typeof Diary> = {
        root: {
          ...first.root,
          model: { notes: [{ at: new Date(7), text: Option.some('kept') }] },
        },
        at: 10,
      };
      const saved = through(History.save(Diary, History.init(snapshot)));
      expect(saved.start.root.model).toEqual({
        notes: [{ at: new Date(7).toISOString(), text: 'kept' }],
      });
      expect(saved.start.at).toBe(10);
      const loaded = History.load(Diary, saved);
      expect(loaded.start).toEqual(snapshot);
      expect(History.snapshot(Diary, loaded).root).toEqual(snapshot.root);
      // Saved again, it is the same JSON.
      expect(through(History.save(Diary, loaded))).toEqual(saved);
    });
  });

  it('keeps a Message for no Instance as it was Sent: it is dropped, so it never plays', () => {
    const history = History.add(History.init(START), {
      to: `${ROOT}/gone#1` as Address,
      message: { _tag: 'Whatever' },
      from: { kind: 'outside' },
      at: 0,
    });
    expect(History.save(Counter, history).entries[0]!.message).toEqual({
      _tag: 'Whatever',
    });
    expect(History.snapshot(Counter, history).root).toBe(START.root);
  });

  it('never changes once given: the next one is new', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* scoped(Counter);
        app.root.send({ _tag: 'Bumped' });
        const before = History.save(Counter, historyOf(app));
        expect(History.save(Counter, historyOf(app))).toBe(before);
        app.root.send({ _tag: 'Bumped' });
        expect(before.entries).toHaveLength(1);
        expect(before.head).toBe(0);
        expect(Object.isFrozen(before)).toBe(true);
        expect(Object.isFrozen(before.entries)).toBe(true);
        const after = History.save(Counter, historyOf(app));
        expect(after.entries).toHaveLength(2);
        expect(after.entries[0]).toBe(before.entries[0]);
        // The start has not moved, so it is saved once.
        expect(after.start).toBe(before.start);
      }),
    ));

  it('is checked when loaded: a Head or a parent that is no entry, or a start that is no Snapshot, fails at once', () =>
    timed(
      Effect.gen(function* () {
        const state = yield* saved();
        expect(() => History.load(Counter, { ...state, head: 9 })).toThrow(
          /Head 9 is not one of its 3 entries/,
        );
        const entries = state.entries.map((entry) =>
          entry.id === 1 ? { ...entry, parent: 2 } : entry,
        );
        expect(() => History.load(Counter, { ...state, entries })).toThrow(
          /entry 1 follows 2/,
        );
        const start = { ...state.start, at: Number.NaN };
        expect(() => History.load(Counter, { ...state, start })).toThrow(
          /the saved Snapshot is corrupt: its Time is NaN/,
        );
      }),
    ));
});

describe('a Window', () => {
  const tags = (history: History) =>
    History.entries(history).map(
      (entry) => `${entry.id} ${entry.message._tag}`,
    );

  it("keeps that many entries on the Head's Branch, after a start moved forward to the Snapshot before them", () =>
    timed(
      Effect.gen(function* () {
        const app = yield* scoped(Counter);
        for (let at = 1; at <= 5; at++) {
          yield* TestClock.adjust('100 millis');
          app.root.send({ _tag: 'Bumped' });
        }
        const kept = History.compact(Counter, historyOf(app), 3);
        expect(tags(kept)).toEqual(['2 Bumped', '3 Bumped', '4 Bumped']);
        expect(History.entries(kept)[0]).toMatchObject({
          parent: null,
          at: 300,
          from: { kind: 'outside' },
        });
        // The start is the app right after the last entry folded into it.
        expect(kept.start).toEqual(seekTo(historyOf(app), 1));
        expect(kept.start.at).toBe(200);
        expect(count(kept, null)).toEqual({ count: 2 });
        expect(count(kept, 2)).toEqual({ count: 3 });
        expect(count(kept, 4)).toEqual({ count: 5 });
        expect(History.entry(kept, 1)).toBeUndefined();
        // The app itself is untouched.
        expect(app.snapshot.root.model).toEqual({ count: 5 });
        expect(History.snapshot(Counter, kept)).toEqual(app.snapshot);
      }),
    ));

  it('keeps the ids of the entries it keeps, and leaves the History it folded as it was', () => {
    let history = History.init(START);
    for (let at = 1; at <= 5; at++) history = bump(history, at * 100);
    const kept = History.compact(Counter, history, 2);
    expect(History.all(kept).map((e) => [e.id, e.parent])).toEqual([
      [3, null],
      [4, 3],
    ]);
    expect(kept.head).toBe(4);
    expect(kept.start).toEqual({
      root: { ...START.root, model: { count: 3 } },
      at: 300,
    });
    // An entry kept is the entry it was, but for the one right after the start.
    expect(History.entry(kept, 4)).toBe(History.entry(history, 4));
    expect(History.entry(kept, 3)).toEqual({
      ...History.entry(history, 3),
      parent: null,
    });
    expect(History.entry(kept, 2)).toBeUndefined();
    expect(() => History.move(kept, 2)).toThrow(/no History entry 2/);
    // Every Snapshot still there is the one it was.
    expect(seekTo(kept, 3)).toEqual(seekTo(history, 3));
    expect(seekTo(kept, 4)).toEqual(seekTo(history, 4));
    // It carries on from its ids.
    expect(bump(kept).head).toBe(5);
    // The History it folded is as it was.
    expect(history.start).toBe(START);
    expect(ids(History.all(history))).toEqual([0, 1, 2, 3, 4]);
    // A Window no smaller than the Branch folds nothing.
    expect(History.compact(Counter, history, 5)).toBe(history);
    expect(History.compact(Counter, history, 9)).toBe(history);
  });

  it('changes while running, and keeping it again changes nothing', () =>
    timed(
      Effect.gen(function* () {
        const { app, kept } = yield* carryOn(History.init(START));
        for (let at = 1; at <= 5; at++) app.root.send({ _tag: 'Bumped' });
        expect(tags(kept.history)).toHaveLength(5);
        expect(History.compact(Counter, kept.history, null)).toBe(kept.history);
        kept.history = History.compact(Counter, kept.history, 2);
        const once = kept.history;
        expect(tags(once)).toEqual(['3 Bumped', '4 Bumped']);
        expect(History.compact(Counter, once, 2)).toBe(once);
        expect(History.compact(Counter, once, null)).toBe(once);
        // The Runtime knows nothing of it, and carries on.
        expect(app.snapshot.root.model).toEqual({ count: 5 });
        app.root.send({ _tag: 'Bumped' });
        expect(kept.history.head).toBe(5);
        expect(tags(kept.history)).toEqual([
          '3 Bumped',
          '4 Bumped',
          '5 Bumped',
        ]);
        expect(count(kept.history, 5)).toEqual({ count: 6 });
        expect(History.snapshot(Counter, kept.history)).toEqual(app.snapshot);
        expect(() => History.compact(Counter, kept.history, -1)).toThrow(
          /0 entries or more, not -1/,
        );
      }),
    ));

  it('sweeps every entry that does not grow from the new start', () => {
    let history = History.init(START);
    for (let at = 1; at <= 5; at++) history = bump(history);
    history = History.add(History.move(history, 1), {
      to: ROOT,
      message: { _tag: 'Started' },
      from: { kind: 'outside' },
      at: 0,
    });
    // The Branch 0 1 5. Two kept, 1 and 5: the start is right after 0, and 2 to 4 grow from it and stay.
    const two = History.compact(Counter, history, 2);
    expect(ids(History.all(two))).toEqual([1, 2, 3, 4, 5]);
    expect(ids(History.children(two, null))).toEqual([1]);
    expect(ids(History.children(two, 1))).toEqual([2, 5]);
    // One kept, 5: the start is right after 1, which 2 grows from as 5 does.
    const one = History.compact(Counter, history, 1);
    expect(ids(History.all(one))).toEqual([2, 3, 4, 5]);
    expect(ids(History.entries(one))).toEqual([5]);
    expect(ids(History.children(one, null))).toEqual([2, 5]);
    expect(History.snapshot(Counter, one).root.state._tag).toBe('Busy');
    expect(History.compact(Counter, one, 1)).toBe(one);
    // None kept: the start is right after 5, and 2 to 4 do not grow from it.
    const none = History.compact(Counter, history, 0);
    expect(History.all(none)).toEqual([]);
    expect(none.start.root.state._tag).toBe('Busy');
    // The Branch 0 1 2 3 4, two kept: the start is right after 2, and 5 grew from 1.
    const other = History.compact(Counter, History.move(history, 4), 2);
    expect(ids(History.all(other))).toEqual([3, 4]);
    expect(History.entry(other, 5)).toBeUndefined();
    expect(ids(History.tips(other))).toEqual([4]);
  });

  it('of 0 keeps no Message, only the app as it is now', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* scoped(Counter);
        for (let at = 1; at <= 3; at++) app.root.send({ _tag: 'Bumped' });
        const kept = History.compact(Counter, historyOf(app), 0);
        expect(tags(kept)).toEqual([]);
        expect(History.all(kept)).toEqual([]);
        expect(kept.head).toBe(null);
        expect(kept.start).toEqual(app.snapshot);
        expect(count(kept)).toEqual({ count: 3 });
        expect(History.compact(Counter, kept, 0)).toBe(kept);
        const { app: again } = yield* carryOn(
          History.load(Counter, History.save(Counter, kept)),
        );
        expect(again.snapshot.root.model).toEqual({ count: 3 });
      }),
    ));

  it('keeps every entry when it is `null`, and 0 entries or more', () => {
    const history = bump(bump(bump(History.init(START))));
    expect(History.compact(Counter, history, null)).toBe(history);
    expect(() => History.compact(Counter, history, -1)).toThrow(
      /0 entries or more, not -1/,
    );
    expect(() => History.compact(Counter, history, 1.5)).toThrow(
      /0 entries or more, not 1.5/,
    );
  });
});
