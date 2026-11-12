import { Effect, Option, Schema } from 'effect';
import type { Scope } from 'effect';
import { TestClock } from 'effect/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { restore } from '../data/play/index.ts';
import { Actor, History, Runtime, Snapshot } from '../index.ts';
import type { Address, Entry, Instance, SavedHistory } from '../index.ts';
import { line } from './fixtures.ts';

/*
 * The History: a plain value grown, moved and read by pure functions,
 * Compacted to a Window, saved as JSON and loaded again, and the Restore
 * that puts a saved tree in it.
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

const ROOT = Snapshot.init(Counter).root.address;

const bump = (history: History, at = 0) =>
  History.add(history, {
    to: ROOT,
    message: { _tag: 'Bumped' },
    from: { kind: 'outside' },
    at,
  }).history;

const count = (history: History, entry: number | null = history.head) =>
  Snapshot.replay(Counter, history, entry).root.model;

/** A History of three Messages, as a Runtime leaves it. */
const saved = (): Effect.Effect<SavedHistory, never, Scope.Scope> =>
  Effect.gen(function* () {
    const app = yield* Runtime.scoped(Counter);
    const root = app.snapshot.root.address;
    yield* TestClock.adjust('100 millis');
    app.send(root, { _tag: 'Bumped' });
    yield* TestClock.adjust('100 millis');
    app.send(root, { _tag: 'Started' });
    yield* TestClock.adjust('100 millis');
    app.send(root, { _tag: 'Bumped' });
    return History.save(Counter, app.history);
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a History value', () => {
  it('grows after its Head, and leaves the History it grew from as it was', () => {
    const empty = History.make();
    const one = bump(empty);
    const two = bump(one);
    expect(empty.entries).toEqual([]);
    expect(empty.head).toBe(null);
    expect(one.entries.map((e) => e.id)).toEqual([0]);
    expect(two.entries.map((e) => [e.id, e.parent])).toEqual([
      [0, null],
      [1, 0],
    ]);
    expect(two.head).toBe(1);
    expect(Object.isFrozen(two)).toBe(true);
    expect(Object.isFrozen(two.entries)).toBe(true);
    // The entries are shared, never copied.
    expect(two.entries[0]).toBe(one.entries[0]);
  });

  it('branches when it grows from an entry that already has one after it', () => {
    const three = bump(bump(bump(History.make())));
    const back = History.go(three, 0);
    expect(back.head).toBe(0);
    expect(back.entries).toHaveLength(3);
    const branched = bump(back);
    expect(History.line(branched).map((e) => e.id)).toEqual([0, 3]);
    expect(History.children(branched, 0).map((e) => e.id)).toEqual([1, 3]);
    // The History it branched from is untouched.
    expect(History.line(three).map((e) => e.id)).toEqual([0, 1, 2]);
    expect(History.children(three, 0).map((e) => e.id)).toEqual([1]);
    // Growing either again keeps them apart.
    expect(History.line(bump(three)).map((e) => e.id)).toEqual([0, 1, 2, 3]);
    expect(History.line(bump(branched)).map((e) => e.id)).toEqual([0, 3, 4]);
  });

  it('reads an entry, the line to any entry, and refuses one it does not have', () => {
    const three = bump(bump(bump(History.make())));
    expect(History.entry(three, 1)?.parent).toBe(0);
    expect(History.entry(three, 9)).toBeUndefined();
    expect(History.line(three, 1).map((e) => e.id)).toEqual([0, 1]);
    expect(History.line(three, null)).toEqual([]);
    expect(() => History.go(three, 9)).toThrow(/no History entry 9/);
  });

  it('names the last entry of every Branch, whichever the Head is on', () => {
    expect(History.tips(History.make())).toEqual([]);
    const three = bump(bump(bump(History.make())));
    expect(History.tips(three).map((e) => e.id)).toEqual([2]);
    const branched = bump(bump(History.go(three, 0)));
    expect(History.tips(branched).map((e) => e.id)).toEqual([2, 4]);
    const fromInit = bump(History.go(branched, null));
    expect(History.tips(fromInit).map((e) => e.id)).toEqual([2, 4, 5]);
    // An older History does not see the entries grown after it.
    expect(History.tips(three).map((e) => e.id)).toEqual([2]);
    expect(History.tips(History.go(branched, 1)).map((e) => e.id)).toEqual([
      2, 4,
    ]);
  });

  it('is plain data: one written by hand reads the same', () => {
    const grown = bump(bump(History.make({ input: 'x' })));
    const plain: History = {
      input: grown.input,
      entries: [...grown.entries],
      head: grown.head,
    };
    expect(History.line(plain)).toEqual(History.line(grown));
    expect(count(plain)).toEqual({ count: 2 });
    expect(History.line(bump(plain)).map((e) => e.id)).toEqual([0, 1, 2]);
    expect(JSON.parse(JSON.stringify(grown))).toEqual({
      input: 'x',
      head: 1,
      entries: JSON.parse(JSON.stringify(grown.entries)),
    });
  });

  it('stays cheap to grow: ten thousand entries in well under a second', () => {
    let history = History.make();
    const started = performance.now();
    for (let at = 0; at < 10_000; at++) history = bump(history, at);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(history.head).toBe(9_999);
    expect(count(history)).toEqual({ count: 10_000 });
  });
});

describe('Restore', () => {
  const first = Snapshot.init(Counter);
  const at42: Instance = {
    ...first.root,
    model: { count: 42 },
    state: { _tag: 'Busy', since: 7 } as Instance['state'],
  };
  const entry = (
    message: { readonly _tag: string },
    to: Address = ROOT,
  ): Entry => ({
    id: 0,
    parent: null,
    to,
    message,
    from: { kind: 'restore' },
    at: 0,
  });

  it('replaces the whole tree, as a Message to the root', () => {
    const played = Snapshot.play(Counter, first, entry(restore(at42)));
    expect(played.outcome).toBe('handled');
    expect(played.snapshot.root).toBe(at42);
    expect(played.snapshot.entry).toBe(0);
  });

  it('clamps the entries that started and changed each Instance to its own', () => {
    const later = { ...at42, started: 5, changed: 9 };
    const played = Snapshot.play(Counter, first, {
      ...entry(restore(later)),
      id: 6,
    });
    expect(played.snapshot.root).toMatchObject({ started: 5, changed: 6 });
  });

  it('is ignored, with one warning, when the tree no longer matches', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stale = entry(restore({ ...at42, state: { _tag: 'Gone' } }));
    const once = Snapshot.play(Counter, first, stale);
    const twice = Snapshot.play(Counter, first, stale);
    expect(once.outcome).toBe('ignored');
    expect(once.snapshot.root).toBe(first.root);
    expect(twice.outcome).toBe('ignored');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('Gone');
  });

  it('is ignored when a Model does not match its Schema', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stale = restore({ ...at42, model: { count: 'many' } });
    expect(Snapshot.play(Counter, first, entry(stale)).outcome).toBe('ignored');
  });

  it('is ignored when a Child is ahead of what its parent has Invoked', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Room = Actor.define('Room', {
      model: Schema.Struct({ guests: Schema.Array(Schema.String) }),
      message: Schema.TaggedUnion({ Came: { name: Schema.String } }),
    }).build({
      init: () => ({ model: { guests: ['ada'] } }),
      children: {
        guest: Actor.child(Counter, { each: ({ model }) => model.guests }),
      },
      on: {
        Came: ({ name }, { model }) => ({
          model: { guests: [...model.guests, name] },
        }),
      },
    });
    const room = Snapshot.init(Room);
    const to = room.root.address;
    const ahead = { ...room.root, invoked: {} };
    expect(Snapshot.play(Room, room, entry(restore(ahead), to)).outcome).toBe(
      'ignored',
    );
    expect(
      Snapshot.play(Room, room, entry(restore({ ...room.root }), to)).outcome,
    ).toBe('handled');
  });

  it('is ignored when a fixed Child its State Invokes is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Shelf = Actor.define('Shelf', {}).build({
      children: { counter: Actor.child(Counter) },
    });
    const shelf = Snapshot.init(Shelf);
    const played = Snapshot.play(
      Shelf,
      shelf,
      entry(restore({ ...shelf.root, children: {} }), shelf.root.address),
    );
    expect(played.outcome).toBe('ignored');
    expect(warn.mock.calls[0]![0]).toContain('holds no such Child');
  });

  it('is dropped when sent to anything but the root', () => {
    const played = Snapshot.play(
      Counter,
      first,
      entry(restore(at42), `${ROOT}/child#1` as never),
    );
    expect(played.outcome).toBe('dropped');
  });
});

describe('History.restored', () => {
  it('is a History of one Restore right after init', () =>
    timed(
      Effect.gen(function* () {
        const state = yield* saved();
        const snapshot = Snapshot.replay(Counter, History.load(Counter, state));
        const light = History.restored(snapshot, { at: 300 });
        expect(light.entries).toHaveLength(1);
        expect(light.head).toBe(0);
        expect(light.entries[0]).toMatchObject({
          parent: null,
          to: 'Counter',
          at: 300,
          from: { kind: 'restore' },
        });
        // The entry holds only the Message and where it sits: what came of it is worked out.
        expect(Object.keys(light.entries[0]!).sort()).toEqual([
          'at',
          'from',
          'id',
          'message',
          'parent',
          'to',
        ]);

        const app = yield* Runtime.scoped(Counter, { history: light });
        expect(app.snapshot.root.model).toEqual(snapshot.root.model);
        expect(app.snapshot.root.state).toEqual(snapshot.root.state);
        expect(app.now()).toBe(300);
        expect(line(app)).toHaveLength(1);
        // Init is still the floor: before the Restore, the Actor's own init.
        expect(count(app.history, null)).toEqual({ count: 0 });
        app.send(app.snapshot.root.address, { _tag: 'Done' });
        expect(app.snapshot.root.state._tag).toBe('Idle');
        expect(line(app).map((e) => e.message._tag)).toEqual([
          '@kestack/kabuki/Restore',
          'Done',
        ]);
      }),
    ));
});

describe('a saved History', () => {
  it('carries on running at its Head, from its Time', () =>
    timed(
      Effect.gen(function* () {
        const state = yield* saved();
        const app = yield* Runtime.scoped(Counter, {
          history: History.load(Counter, state),
        });
        expect(app.running).toBe(true);
        expect(app.history.head).toBe(2);
        expect(app.now()).toBe(300);
        expect(app.snapshot.root.model).toEqual({ count: 2 });
        yield* TestClock.adjust('50 millis');
        app.send(app.snapshot.root.address, { _tag: 'Bumped' });
        expect(line(app).at(-1)).toMatchObject({ id: 3, parent: 2, at: 350 });
      }),
    ));

  it('is plain JSON, its entries and its Head, when the encoded side of every Schema is JSON-safe', () =>
    timed(
      Effect.gen(function* () {
        const state = yield* saved();
        expect(Object.keys(state).sort()).toEqual(['entries', 'head']);
        expect(JSON.parse(JSON.stringify(state))).toEqual(state);
      }),
    ));

  it('saves, Compacts and loads again to the same app, with the same Snapshots', () =>
    timed(
      Effect.gen(function* () {
        let history = History.make();
        for (let at = 1; at <= 6; at++) history = bump(history, at * 10);
        history = History.go(history, 3);
        history = bump(history, 99);
        const compacted = History.compact(Counter, history, 2);
        expect(History.line(compacted).map((e) => e.id)).toEqual([3, 6]);
        // Only what grows from the oldest entry kept stays: 4 and 5 did.
        expect(compacted.entries.map((e) => e.id)).toEqual([3, 4, 5, 6]);
        const through = JSON.parse(
          JSON.stringify(History.save(Counter, compacted)),
        ) as SavedHistory;
        const loaded = History.load(Counter, through, { onMismatch: 'fail' });
        expect(loaded.head).toBe(6);
        expect(Snapshot.replay(Counter, loaded)).toEqual(
          Snapshot.replay(Counter, history),
        );
        expect(Snapshot.replay(Counter, loaded, 5)).toEqual(
          Snapshot.replay(Counter, history, 5),
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
          const app = yield* Runtime.scoped(Diary);
          app.send(app.snapshot.root.address, {
            _tag: 'Wrote',
            note: { at: new Date(5), text: Option.some('hi') },
          });
          app.send(app.snapshot.root.address, {
            _tag: 'Wrote',
            note: { at: new Date(9), text: Option.none() },
          });
          const saved = through(History.save(Diary, app.history));
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
          expect(loaded.entries[0]!.message).toEqual(
            app.history.entries[0]!.message,
          );
          expect(Snapshot.replay(Diary, loaded)).toEqual(app.snapshot);
          // Saved again, it is the same JSON.
          expect(through(History.save(Diary, loaded))).toEqual(saved);
        }),
      ));

    it("so does a Restore's tree", () => {
      const first = Snapshot.init(Diary);
      const snapshot = {
        ...first,
        root: {
          ...first.root,
          model: { notes: [{ at: new Date(7), text: Option.some('kept') }] },
        },
      };
      const saved = through(
        History.save(Diary, History.restored(snapshot, { at: 10 })),
      );
      const message = saved.entries[0]!.message as unknown as {
        readonly root: Instance;
      };
      expect(message.root.model).toEqual({
        notes: [{ at: new Date(7).toISOString(), text: 'kept' }],
      });
      expect(Snapshot.replay(Diary, History.load(Diary, saved)).root).toEqual(
        snapshot.root,
      );
    });
  });

  it('keeps a Message for no Instance as it was Sent: it was dropped, so it never plays', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Counter);
        app.send(`${ROOT}/gone#1` as never, { _tag: 'Whatever' });
        expect(History.save(Counter, app.history).entries[0]!.message).toEqual({
          _tag: 'Whatever',
        });
      }),
    ));

  it('never changes once given: the next one is new', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Counter);
        app.send(app.snapshot.root.address, { _tag: 'Bumped' });
        const before = History.save(Counter, app.history);
        expect(History.save(Counter, app.history)).toBe(before);
        app.send(app.snapshot.root.address, { _tag: 'Bumped' });
        expect(before.entries).toHaveLength(1);
        expect(before.head).toBe(0);
        expect(Object.isFrozen(before.entries)).toBe(true);
        const after = History.save(Counter, app.history);
        expect(after.entries).toHaveLength(2);
        expect(after.entries[0]).toBe(before.entries[0]);
      }),
    ));

  it('is checked when loaded: a Head or a parent that is no entry fails at once', () =>
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
      }),
    ));
});

describe('a Window', () => {
  const tags = (history: History) =>
    History.line(history).map((entry) => `${entry.id} ${entry.message._tag}`);

  it('keeps that many entries on the Branch, the oldest a Restore of the Snapshot after it', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Counter, { window: 3 });
        for (let at = 1; at <= 5; at++) {
          yield* TestClock.adjust('100 millis');
          app.send(app.snapshot.root.address, { _tag: 'Bumped' });
        }
        expect(tags(app.history)).toEqual([
          '2 @kestack/kabuki/Restore',
          '3 Bumped',
          '4 Bumped',
        ]);
        expect(line(app)[0]).toMatchObject({
          parent: null,
          at: 300,
          from: { kind: 'restore' },
        });
        expect(count(app.history, 2)).toEqual({ count: 3 });
        expect(count(app.history, 4)).toEqual({ count: 5 });
        expect(count(app.history, null)).toEqual({ count: 0 });
        expect(History.entry(app.history, 1)).toBeUndefined();
        expect(app.snapshot.root.model).toEqual({ count: 5 });
      }),
    ));

  it('changes while running, and keeping it again changes nothing', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Counter, { window: null });
        for (let at = 1; at <= 5; at++)
          app.send(app.snapshot.root.address, { _tag: 'Bumped' });
        expect(app.window).toBe(null);
        app.keep(2);
        const once = app.history;
        expect(tags(app.history)).toEqual([
          '3 @kestack/kabuki/Restore',
          '4 Bumped',
        ]);
        app.keep(2);
        expect(app.history).toBe(once);
        app.keep(null);
        expect(app.history).toBe(once);
        app.send(app.snapshot.root.address, { _tag: 'Bumped' });
        expect(app.history.head).toBe(5);
        expect(count(app.history, 5)).toEqual({ count: 6 });
        expect(() => app.keep(-1)).toThrow(/0 entries or more, not -1/);
      }),
    ));

  it('sweeps every entry that does not grow from the oldest one kept', () => {
    let history = History.make();
    for (let at = 1; at <= 5; at++) history = bump(history);
    history = History.add(History.go(history, 1), {
      to: ROOT,
      message: { _tag: 'Started' },
      from: { kind: 'outside' },
      at: 0,
    }).history;
    // The Branch 0 1 5: the floor is 1, so 2 to 4 grew from it and stay.
    const two = History.compact(Counter, history, 2);
    expect(two.entries.map((entry) => entry.id)).toEqual([1, 2, 3, 4, 5]);
    expect(History.children(two, 1).map((entry) => entry.id)).toEqual([2, 5]);
    const one = History.compact(Counter, history, 1);
    expect(one.entries.map((entry) => entry.id)).toEqual([5]);
    expect(Snapshot.replay(Counter, one).root.state._tag).toBe('Busy');
    expect(History.compact(Counter, one, 1)).toBe(one);
  });

  it('of 0 keeps no Message, only the app as it is now', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Counter, { window: 0 });
        for (let at = 1; at <= 3; at++)
          app.send(app.snapshot.root.address, { _tag: 'Bumped' });
        expect(tags(app.history)).toEqual(['2 @kestack/kabuki/Restore']);
        expect(count(app.history, 2)).toEqual({ count: 3 });
        const again = yield* Runtime.scoped(Counter, {
          history: History.load(Counter, History.save(Counter, app.history)),
        });
        expect(again.snapshot.root.model).toEqual({ count: 3 });
      }),
    ));

  it('keeps 100 entries unless said, and 0 entries or more', () => {
    const app = Runtime.make(Counter);
    expect(app.window).toBe(100);
    void app.dispose();
    expect(() => Runtime.make(Counter, { window: -1 })).toThrow(
      /0 entries or more, not -1/,
    );
  });
});
