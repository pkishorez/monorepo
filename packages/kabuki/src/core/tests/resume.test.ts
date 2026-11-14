import { Effect, Fiber, Schema, Stream } from 'effect';
import { TestClock } from 'effect/testing';
import { describe, expect, it, vi } from 'vitest';
import { Actor, History, Runtime, Snapshot } from '../index.ts';
import type { AnyActor } from '../actor/index.ts';
import type { SavedHistory } from '../types.ts';
import {
  Counter,
  fork,
  historyOf,
  run,
  scoped,
  settle,
  timed,
} from './fixtures.ts';

/*
 * An app that carries on where it was: its History kept beside its
 * Runtime, saved as it changes, through Effect, and loaded again when the
 * process starts over.
 */

const count = (snapshot: Snapshot) =>
  (snapshot.root.model as { readonly count: number }).count;

/** A Counter whose Model changed shape since it was saved. */
const Renamed = Actor.define('Counter', {
  model: Schema.Struct({ total: Schema.Number }),
  message: Schema.TaggedUnion({ Bumped: {} }),
}).build({
  init: () => ({ model: { total: 0 } }),
  on: { Bumped: (_, { model }) => ({ model: { total: model.total + 1 } }) },
});

/** A Counter that no longer takes the Message it was sent. */
const Quiet = Actor.define('Counter', {
  model: Schema.Struct({ count: Schema.Number }),
  message: Schema.TaggedUnion({ Reset: {} }),
}).build({
  init: () => ({ model: { count: 0 } }),
  on: { Reset: () => ({ model: { count: 0 } }) },
});

/** A History of `n` Bumps, Compacted to a Window, saved. */
const bumped = (n: number, window: number | null = 0) =>
  run(
    Effect.gen(function* () {
      const app = yield* scoped(Counter);
      for (let i = 0; i < n; i++) app.root.send({ _tag: 'Bumped' });
      return History.save(
        Counter,
        History.compact(Counter, historyOf(app), window),
      );
    }),
  );

/**
 * Keep a History beside a Runtime made stopped, Compacted to a Window as it
 * grows, then start it: what a server does.
 */
const keep = <A extends AnyActor>(
  app: Runtime<A>,
  from: History,
  window: number | null,
) => {
  const kept = { history: from };
  app.subscribe((entries) => {
    kept.history = History.compact(
      app.actor,
      History.add(kept.history, entries),
      window,
    );
  });
  void app.start();
  return kept;
};

/** The History kept beside a Runtime, saved: now, then after every change. */
const savedChanges = <A extends AnyActor>(
  app: Runtime<A>,
  kept: { readonly history: History },
) => app.changes.pipe(Stream.map(() => History.save(app.actor, kept.history)));

describe('runtime.changes', () => {
  it('gives the Snapshot now, then once the Mailbox is empty', () =>
    run(
      Effect.gen(function* () {
        const app = yield* scoped(Counter);
        const seen: Array<number> = [];
        yield* app.changes.pipe(
          Stream.runForEach((snapshot) =>
            Effect.sync(() => seen.push(count(snapshot))),
          ),
          Effect.forkScoped,
        );
        yield* settle;
        app.root.send({ _tag: 'Bumped' });
        yield* settle;
        expect(seen).toEqual([0, 1]);
      }),
    ));

  it('saves the History as it changes, a slow reader getting only the latest', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Counter, { running: false });
        const kept = keep(app, History.init(app.snapshot), 0);
        const seen: Array<SavedHistory> = [];
        const reading = yield* savedChanges(app, kept).pipe(
          Stream.runForEach((saved) => Effect.sync(() => seen.push(saved))),
          Effect.forkScoped,
        );
        yield* settle;
        for (let i = 0; i < 5; i++) app.root.send({ _tag: 'Bumped' });
        yield* settle;
        yield* Fiber.interrupt(reading);
        expect(
          seen.map((saved) =>
            count(History.snapshot(Counter, History.load(Counter, saved))),
          ),
        ).toEqual([0, 5]);
        expect(seen.at(-1)).toBe(History.save(Counter, kept.history));
        // Kept to a Window of 0, it is only the app as it is now.
        expect(seen.at(-1)).toMatchObject({ entries: [], head: null });
        expect(kept.history.start).toEqual(app.snapshot);
      }),
    ));
});

describe('an app saved as it changes', () => {
  it('carries on after its process starts over, its Workers started again', async () => {
    let disk: string | undefined;
    const Ticking = Actor.define('Ticking', {
      model: Schema.Struct({ ticks: Schema.Number, on: Schema.Boolean }),
      message: Schema.TaggedUnion({ Started: {}, Ticked: {} }),
    }).build({
      init: () => ({ model: { ticks: 0, on: false } }),
      on: {
        Started: (_, { model }) => ({ model: { ...model, on: true } }),
        Ticked: (_, { model }) => ({
          model: { ...model, ticks: model.ticks + 1 },
        }),
      },
      workers: {
        tick: {
          while: ({ model }) => model.on,
          run: (self) =>
            Effect.forever(
              Effect.sleep('1 second').pipe(
                Effect.andThen(self.send({ _tag: 'Ticked' })),
              ),
            ),
        },
      },
    });

    /** What a server does as it starts: load what it saved, run from its Head, keep saving. */
    const boot = Effect.gen(function* () {
      const loaded =
        disk === undefined
          ? undefined
          : History.load(Ticking, JSON.parse(disk) as SavedHistory, {
              onMismatch: 'fail',
            });
      const app = yield* Runtime.scoped(Ticking, {
        ...(loaded ? { snapshot: History.snapshot(Ticking, loaded) } : {}),
        running: false,
      });
      const kept = keep(app, loaded ?? History.init(app.snapshot), 0);
      const write = (saved: SavedHistory) =>
        Effect.sync(() => {
          disk = JSON.stringify(saved);
        });
      yield* savedChanges(app, kept).pipe(
        Stream.debounce('100 millis'),
        Stream.runForEach(write),
        Effect.forkScoped,
      );
      yield* Effect.addFinalizer(() =>
        write(History.save(Ticking, kept.history)),
      );
      return app;
    });

    await timed(
      Effect.gen(function* () {
        const app = yield* boot;
        app.root.send({ _tag: 'Started' });
        yield* TestClock.adjust('2500 millis');
        expect(app.root.model.ticks).toBe(2);
      }),
    );
    // Kept to a Window of 0, what it saved is only the app as it was, and its Time.
    expect(JSON.parse(disk!)).toMatchObject({
      start: { root: { model: { ticks: 2, on: true } }, at: 2000 },
      entries: [],
      head: null,
    });

    await timed(
      Effect.gen(function* () {
        const app = yield* boot;
        const ticking = app.root;
        expect(app.now()).toBe(2000);
        expect(ticking.model).toEqual({ ticks: 2, on: true });
        expect(ticking.workers).toEqual([
          { name: 'tick', key: '', status: 'running' },
        ]);
        yield* TestClock.adjust('1 second');
        expect(ticking.model.ticks).toBe(3);
      }),
    );
  });
});

describe('a saved History that no longer fits the code', () => {
  it('throws when its start no longer fits, whatever `onMismatch` says', async () => {
    const saved = await bumped(3);
    expect(saved.entries).toEqual([]);
    expect(saved.start.root.model).toEqual({ count: 3 });
    const fits = /the saved Snapshot no longer fits Counter/;
    expect(() => History.load(Renamed, saved)).toThrow(fits);
    expect(() => History.load(Renamed, saved, { onMismatch: 'warn' })).toThrow(
      fits,
    );
    expect(() => History.load(Renamed, saved, { onMismatch: 'fail' })).toThrow(
      fits,
    );
    // So does a start right after init, with entries after it.
    const whole = await bumped(2, null);
    expect(() => History.load(Renamed, whole)).toThrow(fits);
  });

  it('warns of a Message that no longer fits, once, and skips it, by default', async () => {
    const saved = await bumped(2, null);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const history = History.load(Quiet, saved);
    expect(warn).not.toHaveBeenCalled();
    expect(History.all(history)).toHaveLength(2);
    expect(History.snapshot(Quiet, history).root.model).toEqual({ count: 0 });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]![0]).toContain(
      'Replay diverged at entry 0, Bumped for Counter',
    );
    expect(History.snapshot(Quiet, history, 0).root.model).toEqual({
      count: 0,
    });
    expect(warn).toHaveBeenCalledTimes(2);
    // It is kept as it was saved.
    expect(History.save(Quiet, history)).toEqual(saved);
    warn.mockRestore();
  });

  it("fails at once with `onMismatch: 'fail'`, whether its start or a Message no longer fits", async () => {
    const folded = await bumped(3);
    const sent = await bumped(2, null);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => History.load(Renamed, folded, { onMismatch: 'fail' })).toThrow(
      /the saved Snapshot no longer fits Counter/,
    );
    expect(() => History.load(Quiet, sent, { onMismatch: 'fail' })).toThrow(
      /no longer fits the code at entry 0, Bumped for Counter/,
    );
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('fails when a Message no longer decodes, though its decoded side would fit', async () => {
    const setter = (n: typeof Schema.Number | typeof Schema.NumberFromString) =>
      Actor.define('Setter', {
        model: Schema.Struct({ n: Schema.Number }),
        message: Schema.TaggedUnion({ Set: { n } }),
      }).build({
        init: () => ({ model: { n: 0 } }),
        on: { Set: () => ({}) },
      });
    const saved = await run(
      Effect.gen(function* () {
        const Setter = setter(Schema.Number);
        const app = yield* scoped(Setter);
        app.root.send({ _tag: 'Set', n: 42 });
        return History.save(Setter, historyOf(app));
      }),
    );
    expect(() =>
      History.load(setter(Schema.NumberFromString), saved, {
        onMismatch: 'fail',
      }),
    ).toThrow(/at entry 0, Set for Setter: it no longer decodes/);
  });

  it("fails for a Branch other than the Head's too", async () => {
    const Both = Actor.define('Counter', {
      model: Schema.Struct({ count: Schema.Number }),
      message: Schema.TaggedUnion({ Bumped: {}, Reset: {} }),
    }).build({
      init: () => ({ model: { count: 0 } }),
      on: {
        Bumped: (_, { model }) => ({ model: { count: model.count + 1 } }),
        Reset: () => ({ model: { count: 0 } }),
      },
    });
    const saved = await run(
      Effect.gen(function* () {
        const app = yield* scoped(Both);
        app.root.send({ _tag: 'Reset' });
        yield* fork(app, null);
        app.root.send({ _tag: 'Bumped' });
        return History.save(Both, historyOf(app));
      }),
    );
    expect(saved.head).toBe(1);
    expect(saved.entries.map((entry) => entry.parent)).toEqual([null, null]);
    expect(() => History.load(Counter, saved, { onMismatch: 'fail' })).toThrow(
      /at entry 0, Reset for Counter/,
    );
  });

  it('fails for a Message to a slot the code no longer has, and loads one dropped live', async () => {
    const define = () =>
      Actor.define('Parent', {
        model: Schema.Struct({ open: Schema.Boolean }),
        message: Schema.TaggedUnion({ Opened: {} }),
      });
    const Parent = define().build({
      init: () => ({ model: { open: false } }),
      children: {
        child: Actor.child(Counter, { while: ({ model }) => model.open }),
      },
      on: { Opened: () => ({ model: { open: true } }) },
    });
    const Childless = define().build({
      init: () => ({ model: { open: false } }),
      on: { Opened: () => ({ model: { open: true } }) },
    });
    const saved = await run(
      Effect.gen(function* () {
        const app = yield* scoped(Parent);
        app.root.send({ _tag: 'Opened' });
        const child = app.root.children.child!;
        expect(child.address).toBe('Parent/child#1');
        child.send({ _tag: 'Bumped' });
        // For a Child never there, as work that outlives its Instance Sends: dropped as it is played.
        const history = History.add(historyOf(app), {
          to: 'Parent/child#2' as never,
          message: { _tag: 'Bumped' },
          from: { kind: 'worker', instance: child.address, name: 'late' },
          at: app.now(),
        });
        expect(History.snapshot(Parent, history).root).toEqual(
          app.snapshot.root,
        );
        return History.save(Parent, history);
      }),
    );
    expect(saved.entries.map((entry) => entry.to)).toEqual([
      'Parent',
      'Parent/child#1',
      'Parent/child#2',
    ]);
    expect(History.load(Parent, saved, { onMismatch: 'fail' }).head).toBe(2);
    expect(() =>
      History.load(Childless, saved, { onMismatch: 'fail' }),
    ).toThrow(
      /at entry 1, Bumped for Parent\/child#1: the code no longer has a slot/,
    );
  });

  it("loads one whose root's name holds a `/`", async () => {
    const Named = Actor.define('app/Counter', {
      model: Schema.Struct({ count: Schema.Number }),
      message: Schema.TaggedUnion({ Bumped: {} }),
    }).build({
      init: () => ({ model: { count: 0 } }),
      on: {
        Bumped: (_, { model }) => ({ model: { count: model.count + 1 } }),
      },
    });
    const saved = await run(
      Effect.gen(function* () {
        const app = yield* scoped(Named);
        expect(app.snapshot.root.address).toBe('app/Counter');
        app.root.send({ _tag: 'Bumped' });
        return History.save(Named, historyOf(app));
      }),
    );
    const history = History.load(Named, saved, { onMismatch: 'fail' });
    expect(count(History.snapshot(Named, history))).toBe(1);
  });

  it("loads one that still fits with `onMismatch: 'fail'`", async () => {
    const history = History.load(Counter, await bumped(3), {
      onMismatch: 'fail',
    });
    expect(count(History.snapshot(Counter, history))).toBe(3);
    const whole = History.load(Counter, await bumped(3, null), {
      onMismatch: 'fail',
    });
    expect(whole.head).toBe(2);
    expect(count(History.snapshot(Counter, whole))).toBe(3);
  });
});
