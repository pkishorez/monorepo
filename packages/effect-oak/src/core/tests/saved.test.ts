import { Effect, Schema } from 'effect';
import type { Scope } from 'effect';
import { TestClock } from 'effect/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Actor,
  Replay,
  Runtime,
  handle,
  init,
  instanceAt,
  restore,
} from '../index.ts';
import type { RuntimeState, Snapshot } from '../index.ts';

/*
 * A saved Log: what an app carries on from, and the Restore that puts a
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

/** A Log of three Messages, as a Runtime leaves it. */
const saved = (): Effect.Effect<RuntimeState, never, Scope.Scope> =>
  Effect.gen(function* () {
    const app = yield* Runtime.start(Counter);
    yield* TestClock.adjust('100 millis');
    app.send('Counter', { _tag: 'Bumped' });
    yield* TestClock.adjust('100 millis');
    app.send('Counter', { _tag: 'Started' });
    yield* TestClock.adjust('100 millis');
    app.send('Counter', { _tag: 'Bumped' });
    return app.state();
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
        const state = yield* saved();
        const branch = state.entries;
        const folded = Replay.fold(Counter.definition, branch);
        const sought = yield* Replay.make(Counter.definition, undefined).seek(
          branch,
        );
        expect(folded).toEqual(sought);
        expect(folded.model).toEqual({ count: 2 });
        expect(folded.state).toEqual({ _tag: 'Busy', since: 200 });
      }),
    ));
});

describe('Replay.restored', () => {
  it('is a Log of one Restore right after init', () =>
    timed(
      Effect.gen(function* () {
        const state = yield* saved();
        const snapshot = Replay.fold(Counter.definition, state.entries);
        const light = Replay.restored(Counter.definition, snapshot, 300);
        expect(light.entries).toHaveLength(1);
        expect(light.head).toBe(0);
        expect(light.entries[0]).toMatchObject({
          parent: null,
          destination: 'Counter',
          at: 300,
          source: { kind: 'restore' },
        });
        // The entry holds only the Envelope: what came of it is worked out.
        expect(Object.keys(light.entries[0]!).sort()).toEqual([
          'at',
          'destination',
          'id',
          'message',
          'parent',
          'source',
        ]);

        const app = yield* Runtime.start(Counter, { saved: light });
        expect(app.snapshot()).toEqual(snapshot);
        expect(app.now()).toBe(300);
        expect(app.log()).toHaveLength(1);
        // Init is still the floor: before the Restore, the Actor's own init.
        expect(app.snapshotAt(null).model).toEqual({ count: 0 });
        yield* app.show('init');
        expect(app.drawn().model).toEqual({ count: 0 });
        yield* app.show(null);
        app.send('Counter', { _tag: 'Done' });
        expect(app.snapshot().state._tag).toBe('Idle');
        expect(app.log().map((e) => e.message._tag)).toEqual([
          '@effect-oak/Restore',
          'Done',
        ]);
      }),
    ));
});

describe('a shared Replay', () => {
  it('cannot be given beside an Input', async () => {
    const replay = Replay.make(Counter.definition, undefined);
    await expect(
      timed(Runtime.start(Counter, { input: {}, replay })),
    ).rejects.toThrow('give the Input to the Replay');
  });
});

describe('a saved Log', () => {
  it('carries on live at its Head, from its Time', () =>
    timed(
      Effect.gen(function* () {
        const state = yield* saved();
        const app = yield* Runtime.start(Counter, { saved: state });
        expect(app.state().running).toBe(true);
        expect(app.state().head).toBe(2);
        expect(app.now()).toBe(300);
        expect(instanceAt(app.snapshot(), 'Counter')?.model).toEqual({
          count: 2,
        });
        yield* TestClock.adjust('50 millis');
        app.send('Counter', { _tag: 'Bumped' });
        expect(app.log().at(-1)).toMatchObject({ id: 3, parent: 2, at: 350 });
      }),
    ));

  it('stays stopped when it was saved stopped', () =>
    timed(
      Effect.gen(function* () {
        const state = yield* saved();
        const app = yield* Runtime.start(Counter, {
          saved: { ...state, running: false },
        });
        expect(app.state().running).toBe(false);
        expect(app.now()).toBe(300);
        expect(app.snapshot().model).toEqual({ count: 2 });
        app.send('Counter', { _tag: 'Bumped' });
        expect(app.log()).toHaveLength(3);
        yield* app.start();
        expect(app.state().running).toBe(true);
        app.send('Counter', { _tag: 'Bumped' });
        expect(app.snapshot().model).toEqual({ count: 3 });
      }),
    ));

  it('shows the entry it was showing, with the live app underneath', () =>
    timed(
      Effect.gen(function* () {
        const state = yield* saved();
        const app = yield* Runtime.start(Counter, {
          saved: { ...state, shown: 0 },
        });
        expect(app.state().shown).toBe(0);
        expect(app.state().running).toBe(true);
        expect(app.drawn().model).toEqual({ count: 1 });
        expect(app.snapshot().model).toEqual({ count: 2 });
        yield* app.show(null);
        expect(app.drawn()).toBe(app.snapshot());
      }),
    ));
});
