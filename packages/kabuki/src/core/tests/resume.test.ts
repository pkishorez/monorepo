import { Effect, Fiber, Schema, Stream } from 'effect';
import { TestClock } from 'effect/testing';
import { describe, expect, it, vi } from 'vitest';
import { Actor, History, Runtime, instanceAt } from '../index.ts';
import type { SavedHistory } from '../index.ts';
import { Counter, run, settle, timed } from './fixtures.ts';

/*
 * An app that carries on where it was: its History saved as it changes,
 * through Effect, and loaded again when the process starts over.
 */

const count = (snapshot: { readonly model: unknown }) =>
  (snapshot.model as { readonly count: number }).count;

/** A Counter whose Model changed shape since it was saved. */
const Renamed = Actor.build(
  Actor.define('Counter', {
    model: Schema.Struct({ total: Schema.Number }),
    message: Schema.TaggedUnion({ Bumped: {} }),
  }),
  {
    init: () => ({ model: { total: 0 } }),
    on: { Bumped: (_, { model }) => ({ model: { total: model.total + 1 } }) },
  },
);

/** A Counter that no longer takes the Message it was sent. */
const Quiet = Actor.build(
  Actor.define('Counter', {
    model: Schema.Struct({ count: Schema.Number }),
    message: Schema.TaggedUnion({ Reset: {} }),
  }),
  {
    init: () => ({ model: { count: 0 } }),
    on: { Reset: () => ({ model: { count: 0 } }) },
  },
);

/** A History of `n` Bumps, saved. */
const bumped = (n: number, window: number | null = 0) =>
  run(
    Effect.gen(function* () {
      const app = yield* Runtime.start(History.make(Counter, { window }));
      for (let i = 0; i < n; i++) app.send('Counter', { _tag: 'Bumped' });
      return app.history.save();
    }),
  );

describe('history.changes', () => {
  it('gives the saved History now, then after every change', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Counter);
        const seen: Array<SavedHistory> = [];
        const reading = yield* app.history.changes.pipe(
          Stream.runForEach((saved) => Effect.sync(() => seen.push(saved))),
          Effect.forkScoped,
        );
        yield* settle;
        app.send('Counter', { _tag: 'Bumped' });
        yield* settle;
        app.send('Counter', { _tag: 'Bumped' });
        yield* settle;
        yield* Fiber.interrupt(reading);
        expect(seen.map((saved) => saved.entries.length)).toEqual([0, 1, 1]);
        expect(seen.at(-1)).toBe(app.history.save());
      }),
    ));

  it('hands a slow reader only the latest', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Counter);
        const seen: Array<number> = [];
        yield* app.history.changes.pipe(
          Stream.runForEach((saved) =>
            Effect.sync(() =>
              seen.push(
                count(History.load(Counter, saved).snapshotAt(saved.head)),
              ),
            ),
          ),
          Effect.forkScoped,
        );
        yield* settle;
        for (let i = 0; i < 5; i++) app.send('Counter', { _tag: 'Bumped' });
        yield* settle;
        expect(seen).toEqual([0, 5]);
      }),
    ));
});

describe('running.changes', () => {
  it('gives the live Snapshot now, then once the Mailbox is empty', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Counter);
        const seen: Array<number> = [];
        yield* app.changes.pipe(
          Stream.runForEach((snapshot) =>
            Effect.sync(() => seen.push(count(snapshot))),
          ),
          Effect.forkScoped,
        );
        yield* settle;
        app.send('Counter', { _tag: 'Bumped' });
        yield* settle;
        expect(seen).toEqual([0, 1]);
      }),
    ));
});

describe('an app saved as it changes', () => {
  it('carries on after its process starts over, its Workers started again', async () => {
    let disk: string | undefined;
    const Ticking = Actor.build(
      Actor.define('Ticking', {
        model: Schema.Struct({ ticks: Schema.Number, on: Schema.Boolean }),
        message: Schema.TaggedUnion({ Started: {}, Ticked: {} }),
      }),
      {
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
      },
    );

    /** What a server does as it starts: load what it saved, keep saving. */
    const boot = Effect.gen(function* () {
      const history =
        disk === undefined
          ? History.make(Ticking, { window: 0 })
          : History.load(Ticking, JSON.parse(disk) as SavedHistory, {
              window: 0,
              onMismatch: 'fail',
            });
      const write = (saved: SavedHistory) =>
        Effect.sync(() => {
          disk = JSON.stringify(saved);
        });
      yield* history.changes.pipe(
        Stream.debounce('100 millis'),
        Stream.runForEach(write),
        Effect.forkScoped,
      );
      yield* Effect.addFinalizer(() => write(history.save()));
      return yield* Runtime.start(history);
    });

    await timed(
      Effect.gen(function* () {
        const app = yield* boot;
        app.instance({ from: 'test' }).send({ _tag: 'Started' });
        yield* TestClock.adjust('2500 millis');
        expect(app.instance({ from: 'test' }).model.ticks).toBe(2);
      }),
    );

    await timed(
      Effect.gen(function* () {
        const app = yield* boot;
        const ticking = app.instance({ from: 'test' });
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
  it('warns and starts from init by default', async () => {
    const saved = await bumped(3);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const history = History.load(Renamed, saved);
    expect(
      instanceAt(history.snapshotAt(history.head()), 'Counter')?.model,
    ).toEqual({ total: 0 });
    warn.mockRestore();
  });

  it("fails at once with `onMismatch: 'fail'`, whether its Snapshot or a Message no longer fits", async () => {
    const restored = await bumped(3);
    const sent = await bumped(2, null);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() =>
      History.load(Renamed, restored, { onMismatch: 'fail' }),
    ).toThrow(/no longer fits the code at entry 2, @kestack\/kabuki\/Restore/);
    expect(() => History.load(Quiet, sent, { onMismatch: 'fail' })).toThrow(
      /no longer fits the code at entry 0, Bumped for Counter/,
    );
    warn.mockRestore();
  });

  it('fails before a Window Compacts away what does not fit', async () => {
    const sent = await bumped(2, null);
    expect(() =>
      History.load(Quiet, sent, { window: 0, onMismatch: 'fail' }),
    ).toThrow(/at entry 0, Bumped for Counter/);
  });

  it('fails when a Message no longer decodes, though its decoded side would fit', async () => {
    const setter = (n: typeof Schema.Number | typeof Schema.NumberFromString) =>
      Actor.build(
        Actor.define('Setter', {
          model: Schema.Struct({ n: Schema.Number }),
          message: Schema.TaggedUnion({ Set: { n } }),
        }),
        {
          init: () => ({ model: { n: 0 } }),
          on: { Set: () => ({}) },
        },
      );
    const saved = await run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(History.make(setter(Schema.Number)));
        app.send('Setter', { _tag: 'Set', n: 42 });
        return app.history.save();
      }),
    );
    expect(() =>
      History.load(setter(Schema.NumberFromString), saved, {
        onMismatch: 'fail',
      }),
    ).toThrow(/at entry 0, Set for Setter: it no longer decodes/);
  });

  it("fails for a Branch other than the Head's too", async () => {
    const Both = Actor.build(
      Actor.define('Counter', {
        model: Schema.Struct({ count: Schema.Number }),
        message: Schema.TaggedUnion({ Bumped: {}, Reset: {} }),
      }),
      {
        init: () => ({ model: { count: 0 } }),
        on: {
          Bumped: (_, { model }) => ({ model: { count: model.count + 1 } }),
          Reset: () => ({ model: { count: 0 } }),
        },
      },
    );
    const saved = await run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(History.make(Both));
        app.send('Counter', { _tag: 'Reset' });
        yield* app.start(null);
        app.send('Counter', { _tag: 'Bumped' });
        return app.history.save();
      }),
    );
    expect(saved.head).toBe(1);
    expect(() => History.load(Counter, saved, { onMismatch: 'fail' })).toThrow(
      /at entry 0, Reset for Counter/,
    );
  });

  it('fails for a Message to a slot the code no longer has, and loads one dropped live', async () => {
    const parent = (withChild: boolean) =>
      Actor.build(
        Actor.define('Parent', {}),
        withChild ? { children: { child: { actor: Counter } } } : {},
      );
    const saved = await run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(History.make(parent(true)));
        app.send('Parent/child#1', { _tag: 'Bumped' });
        // Never there: dropped live.
        app.send('Parent/child#2', { _tag: 'Bumped' });
        return app.history.save();
      }),
    );
    expect(
      History.load(parent(true), saved, { onMismatch: 'fail' }).head(),
    ).toBe(1);
    expect(() =>
      History.load(parent(false), saved, { window: 0, onMismatch: 'fail' }),
    ).toThrow(
      /at entry 0, Bumped for Parent\/child#1: the code no longer has a slot/,
    );
  });

  it("loads one whose root's name holds a `/`", async () => {
    const Named = Actor.build(
      Actor.define('app/Counter', {
        model: Schema.Struct({ count: Schema.Number }),
        message: Schema.TaggedUnion({ Bumped: {} }),
      }),
      {
        init: () => ({ model: { count: 0 } }),
        on: {
          Bumped: (_, { model }) => ({ model: { count: model.count + 1 } }),
        },
      },
    );
    const saved = await run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(History.make(Named));
        app.send('app/Counter', { _tag: 'Bumped' });
        return app.history.save();
      }),
    );
    const history = History.load(Named, saved, { onMismatch: 'fail' });
    expect(count(history.snapshotAt(history.head()))).toBe(1);
  });

  it("loads one that still fits with `onMismatch: 'fail'`", async () => {
    const history = History.load(Counter, await bumped(3), {
      onMismatch: 'fail',
    });
    expect(count(history.snapshotAt(history.head()))).toBe(3);
  });
});
