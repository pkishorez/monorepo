import { Effect, Option, Schema } from 'effect';
import type { Scope } from 'effect';
import { TestClock } from 'effect/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Actor,
  History,
  Replay,
  Runtime,
  handle,
  init,
  instanceAt,
  restore,
} from '../index.ts';
import type { SavedHistory, Snapshot } from '../index.ts';

/*
 * A saved History: what an app carries on from, and the Restore that puts a
 * saved Snapshot in it.
 */

const Counter = Actor.make('Counter', {
  model: Schema.Struct({ count: Schema.Number }),
  state: Schema.TaggedUnion({ Idle: {}, Busy: { since: Schema.Number } }),
  message: Schema.TaggedUnion({ Bumped: {}, Started: {}, Done: {} }),
}).build({
  init: () => ({ model: { count: 0 }, state: { _tag: 'Idle' } }),
  on: {
    Bumped: (_, { model }) => ({ model: { count: model.count + 1 } }),
  },
  state: {
    Idle: {
      on: { Started: (_, { at }) => ({ state: { _tag: 'Busy', since: at } }) },
    },
    Busy: { on: { Done: () => ({ state: { _tag: 'Idle' } }) } },
  },
});

const timed = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(Effect.provide(TestClock.layer())),
  );

const envelope = (message: { readonly _tag: string }, at = 0) => ({
  destination: 'Counter',
  message,
  source: { kind: 'view', instance: 'Counter' } as const,
  at,
});

/** A History of three Messages, as a Runtime leaves it. */
const saved = (): Effect.Effect<SavedHistory, never, Scope.Scope> =>
  Effect.gen(function* () {
    const app = yield* Runtime.start(Counter);
    yield* TestClock.adjust('100 millis');
    app.send('Counter', { _tag: 'Bumped' });
    yield* TestClock.adjust('100 millis');
    app.send('Counter', { _tag: 'Started' });
    yield* TestClock.adjust('100 millis');
    app.send('Counter', { _tag: 'Bumped' });
    return app.history.save();
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Restore', () => {
  const first = init(Counter.definition);
  const at42: Snapshot = {
    ...first,
    model: { count: 42 },
    state: { _tag: 'Busy', since: 7 } as Snapshot['state'],
  };

  it('replaces the whole Snapshot, as a Message to the root', () => {
    const handled = handle(Counter.definition, first, envelope(restore(at42)));
    expect(handled.outcome).toBe('handled');
    expect(handled.from).toBe('Idle');
    expect(handled.to).toBe('Busy');
    expect(handled.snapshot).toBe(at42);
  });

  it('is ignored, with one warning, when the Snapshot no longer matches', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stale = restore({ ...at42, state: { _tag: 'Gone' } });
    const once = handle(Counter.definition, first, envelope(stale));
    const twice = handle(Counter.definition, first, envelope(stale));
    expect(once.outcome).toBe('ignored');
    expect(once.snapshot).toBe(first);
    expect(twice.outcome).toBe('ignored');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('Gone');
  });

  it('is ignored when a Model does not match its Schema', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stale = restore({ ...at42, model: { count: 'many' } });
    expect(handle(Counter.definition, first, envelope(stale)).outcome).toBe(
      'ignored',
    );
  });

  it('is ignored when a Child is ahead of what its parent has Invoked', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Room = Actor.make('Room', {
      model: Schema.Struct({ guests: Schema.Array(Schema.String) }),
      message: Schema.TaggedUnion({ Came: { name: Schema.String } }),
    }).build({
      init: () => ({ model: { guests: ['ada'] } }),
      children: { guest: Actor.many(Counter) },
      invoke: ({ model }) => ({
        guest: model.guests.map((key) => ({ key })),
      }),
      on: {
        Came: ({ name }, { model }) => ({
          model: { guests: [...model.guests, name] },
        }),
      },
    });
    const room = init(Room.definition);
    const ahead: Snapshot = { ...room, invoked: {} };
    const stale = handle(Room.definition, room, {
      ...envelope(restore(ahead)),
      destination: 'Room',
    });
    expect(stale.outcome).toBe('ignored');
    const fine = handle(Room.definition, room, {
      ...envelope(restore({ ...room })),
      destination: 'Room',
    });
    expect(fine.outcome).toBe('handled');
  });

  it('is ignored when a fixed Child its State Invokes is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Shelf = Actor.make('Shelf', {}).build({
      children: { counter: Counter },
    });
    const shelf = init(Shelf.definition);
    const handled = handle(Shelf.definition, shelf, {
      ...envelope(restore({ ...shelf, children: {} })),
      destination: 'Shelf',
    });
    expect(handled.outcome).toBe('ignored');
    expect(warn.mock.calls[0]![0]).toContain('holds no such Child');
  });

  it('is dropped when sent to anything but the root', () => {
    const handled = handle(Counter.definition, first, {
      ...envelope(restore(at42)),
      destination: 'Counter/child#1',
    });
    expect(handled.outcome).toBe('dropped');
  });
});

describe('Replay.fold', () => {
  it('gives the Snapshot after a Branch, now, the same as seek', () =>
    timed(
      Effect.gen(function* () {
        const history = History.load(Counter, yield* saved());
        const folded = Replay.fold(Counter.definition, history.branch());
        expect(folded).toEqual(yield* history.seek());
        expect(folded.model).toEqual({ count: 2 });
        expect(folded.state).toEqual({ _tag: 'Busy', since: 200 });
      }),
    ));

  it("plays from init with the root's Input", () => {
    const From = Actor.make('From', {
      input: Schema.Struct({ start: Schema.Number }),
      model: Schema.Struct({ count: Schema.Number }),
      message: Schema.TaggedUnion({ Bumped: {} }),
    }).build({
      init: ({ start }) => ({ model: { count: start } }),
      on: { Bumped: (_, { model }) => ({ model: { count: model.count + 1 } }) },
    });
    const branch = [
      {
        ...envelope({ _tag: 'Bumped' }),
        destination: 'From',
        id: 0,
        parent: null,
      },
    ];
    expect(Replay.fold(From.definition, branch, { start: 5 }).model).toEqual({
      count: 6,
    });
  });
});

describe('History.restored', () => {
  it('is a History of one Restore right after init', () =>
    timed(
      Effect.gen(function* () {
        const state = yield* saved();
        const snapshot = Replay.fold(Counter.definition, state.entries);
        const light = History.restored(Counter, snapshot, 300);
        expect(light.save().entries).toHaveLength(1);
        expect(light.head()).toBe(0);
        expect(light.save().entries[0]).toMatchObject({
          parent: null,
          destination: 'Counter',
          at: 300,
          source: { kind: 'restore' },
        });
        // The entry holds only the Envelope: what came of it is worked out.
        expect(Object.keys(light.save().entries[0]!).sort()).toEqual([
          'at',
          'destination',
          'id',
          'message',
          'parent',
          'source',
        ]);

        const app = yield* Runtime.start(light);
        expect(app.snapshot()).toEqual(snapshot);
        expect(app.now()).toBe(300);
        expect(app.history.branch()).toHaveLength(1);
        // Init is still the floor: before the Restore, the Actor's own init.
        expect(app.history.snapshotAt(null).model).toEqual({ count: 0 });
        app.send('Counter', { _tag: 'Done' });
        expect(app.snapshot().state._tag).toBe('Idle');
        expect(app.history.branch().map((e) => e.message._tag)).toEqual([
          '@kestack/kabuki/Restore',
          'Done',
        ]);
      }),
    ));
});

describe('a saved History', () => {
  it('carries on live at its Head, from its Time', () =>
    timed(
      Effect.gen(function* () {
        const state = yield* saved();
        const app = yield* Runtime.start(History.load(Counter, state));
        expect(app.running()).toBe(true);
        expect(app.history.head()).toBe(2);
        expect(app.now()).toBe(300);
        expect(instanceAt(app.snapshot(), 'Counter')?.model).toEqual({
          count: 2,
        });
        yield* TestClock.adjust('50 millis');
        app.send('Counter', { _tag: 'Bumped' });
        expect(app.history.branch().at(-1)).toMatchObject({
          id: 3,
          parent: 2,
          at: 350,
        });
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

  describe('holds each value as its Schema encodes it', () => {
    const Note = Schema.Struct({
      at: Schema.DateFromString,
      text: Schema.OptionFromNullOr(Schema.String),
    });
    const Diary = Actor.make('Diary', {
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
          const app = yield* Runtime.start(Diary);
          app.send('Diary', {
            _tag: 'Wrote',
            note: { at: new Date(5), text: Option.some('hi') },
          });
          app.send('Diary', {
            _tag: 'Wrote',
            note: { at: new Date(9), text: Option.none() },
          });
          const saved = through(app.history.save());
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
          expect(loaded.branch()[0]!.message).toEqual(
            app.history.branch()[0]!.message,
          );
          expect(yield* loaded.seek()).toEqual(app.snapshot());
          // Saved again, it is the same JSON.
          expect(through(loaded.save())).toEqual(saved);
        }),
      ));

    it("so does a Restore's Snapshot", () =>
      timed(
        Effect.gen(function* () {
          const snapshot: Snapshot = {
            ...init(Diary.definition),
            model: { notes: [{ at: new Date(7), text: Option.some('kept') }] },
          };
          const saved = through(History.restored(Diary, snapshot, 10).save());
          const message = saved.entries[0]!.message as unknown as {
            readonly snapshot: Snapshot;
          };
          expect(message.snapshot.model).toEqual({
            notes: [{ at: new Date(7).toISOString(), text: 'kept' }],
          });
          expect(yield* History.load(Diary, saved).seek()).toEqual(snapshot);
        }),
      ));
  });

  it('keeps a Message for no Instance as it was Sent: it was dropped, so it never plays', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Counter);
        app.send('Counter/gone#1', { _tag: 'Whatever' });
        expect(app.history.save().entries[0]!.message).toEqual({
          _tag: 'Whatever',
        });
      }),
    ));

  it('never changes once given: the next one is new', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Counter);
        app.send('Counter', { _tag: 'Bumped' });
        const before = app.history.save();
        expect(app.history.save()).toBe(before);
        app.send('Counter', { _tag: 'Bumped' });
        expect(before.entries).toHaveLength(1);
        expect(before.head).toBe(0);
        expect(Object.isFrozen(before.entries)).toBe(true);
        expect(app.history.save().entries).toHaveLength(2);
        expect(app.history.save().entries[0]).toBe(before.entries[0]);
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

describe('the History lock', () => {
  it('is held until every Runtime on it lets go', () =>
    timed(
      Effect.gen(function* () {
        const history = History.make(Counter);
        const one = yield* Runtime.start(history);
        const two = yield* Runtime.start(history);
        yield* one.stop();
        yield* one.stop();
        expect(() => history.moveHead(null)).toThrow(/stop the Runtime/);
        yield* two.stop();
        expect(() => history.moveHead(null)).not.toThrow();
      }),
    ));
});
