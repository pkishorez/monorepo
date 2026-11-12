import { Effect, Fiber, Schema, Stream } from 'effect';
import { TestClock } from 'effect/testing';
import { describe, expect, it, vi } from 'vitest';
import { Actor, History, Runtime, Snapshot } from '../index.ts';
import type { AnyActor } from '../actor/index.ts';
import type { SavedHistory } from '../index.ts';
import { Counter, run, settle, timed } from './fixtures.ts';

/*
 * An app that carries on where it was: its History saved as it changes,
 * through Effect, and loaded again when the process starts over.
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

/** A History of `n` Bumps, saved. */
const bumped = (n: number, window: number | null = 0) =>
  run(
    Effect.gen(function* () {
      const app = yield* Runtime.scoped(Counter, { window });
      for (let i = 0; i < n; i++)
        app.send(app.snapshot.root.address, { _tag: 'Bumped' });
      return History.save(Counter, app.history);
    }),
  );

/** What a Runtime of `actor` holds now, saved: now, then after every change. */
const savedChanges = <A extends AnyActor>(app: Runtime<A>) =>
  app.changes.pipe(Stream.map(() => History.save(app.actor, app.history)));

describe('runtime.changes', () => {
  it('gives the Snapshot now, then once the Mailbox is empty', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Counter);
        const seen: Array<number> = [];
        yield* app.changes.pipe(
          Stream.runForEach((snapshot) =>
            Effect.sync(() => seen.push(count(snapshot))),
          ),
          Effect.forkScoped,
        );
        yield* settle;
        app.send(app.snapshot.root.address, { _tag: 'Bumped' });
        yield* settle;
        expect(seen).toEqual([0, 1]);
      }),
    ));

  it('saves the History as it changes, a slow reader getting only the latest', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Counter, { window: 0 });
        const seen: Array<SavedHistory> = [];
        const reading = yield* savedChanges(app).pipe(
          Stream.runForEach((saved) => Effect.sync(() => seen.push(saved))),
          Effect.forkScoped,
        );
        yield* settle;
        for (let i = 0; i < 5; i++)
          app.send(app.snapshot.root.address, { _tag: 'Bumped' });
        yield* settle;
        yield* Fiber.interrupt(reading);
        expect(
          seen.map((saved) =>
            count(Snapshot.replay(Counter, History.load(Counter, saved))),
          ),
        ).toEqual([0, 5]);
        expect(seen.at(-1)).toBe(History.save(Counter, app.history));
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

    /** What a server does as it starts: load what it saved, keep saving. */
    const boot = Effect.gen(function* () {
      const app = yield* Runtime.scoped(Ticking, {
        window: 0,
        ...(disk === undefined
          ? {}
          : {
              history: History.load(Ticking, JSON.parse(disk) as SavedHistory, {
                onMismatch: 'fail',
              }),
            }),
      });
      const write = (saved: SavedHistory) =>
        Effect.sync(() => {
          disk = JSON.stringify(saved);
        });
      yield* savedChanges(app).pipe(
        Stream.debounce('100 millis'),
        Stream.runForEach(write),
        Effect.forkScoped,
      );
      yield* Effect.addFinalizer(() =>
        write(History.save(Ticking, app.history)),
      );
      return app;
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
    expect(Snapshot.replay(Renamed, history).root.model).toEqual({ total: 0 });
    warn.mockRestore();
  });

  it("fails at once with `onMismatch: 'fail'`, whether its tree or a Message no longer fits", async () => {
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
        const app = yield* Runtime.scoped(Setter);
        app.send(app.snapshot.root.address, { _tag: 'Set', n: 42 });
        return History.save(Setter, app.history);
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
        const app = yield* Runtime.scoped(Both);
        app.send(app.snapshot.root.address, { _tag: 'Reset' });
        yield* Effect.promise(() => app.fork(null));
        app.send(app.snapshot.root.address, { _tag: 'Bumped' });
        return History.save(Both, app.history);
      }),
    );
    expect(saved.head).toBe(1);
    expect(() => History.load(Counter, saved, { onMismatch: 'fail' })).toThrow(
      /at entry 0, Reset for Counter/,
    );
  });

  it('fails for a Message to a slot the code no longer has, and loads one dropped live', async () => {
    const parent = (withChild: boolean) =>
      Actor.define('Parent', {}).build(
        withChild ? { children: { child: Actor.child(Counter) } } : {},
      );
    const Parent = parent(true);
    const saved = await run(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Parent, { window: null });
        app.send(
          Snapshot.at(app.snapshot, 'Parent/child#1' as never)!.address,
          {
            _tag: 'Bumped',
          },
        );
        // Never there: dropped live.
        app.send('Parent/child#2' as never, { _tag: 'Bumped' });
        return History.save(Parent, app.history);
      }),
    );
    expect(History.load(Parent, saved, { onMismatch: 'fail' }).head).toBe(1);
    expect(() =>
      History.load(parent(false), saved, { onMismatch: 'fail' }),
    ).toThrow(
      /at entry 0, Bumped for Parent\/child#1: the code no longer has a slot/,
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
        const app = yield* Runtime.scoped(Named);
        expect(app.snapshot.root.address).toBe('app/Counter');
        app.send(app.snapshot.root.address, { _tag: 'Bumped' });
        return History.save(Named, app.history);
      }),
    );
    const history = History.load(Named, saved, { onMismatch: 'fail' });
    expect(count(Snapshot.replay(Named, history))).toBe(1);
  });

  it("loads one that still fits with `onMismatch: 'fail'`", async () => {
    const history = History.load(Counter, await bumped(3), {
      onMismatch: 'fail',
    });
    expect(count(Snapshot.replay(Counter, history))).toBe(3);
  });
});
