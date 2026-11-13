import { Effect, Exit, Layer, Schema, Stream } from 'effect';
import { TestClock } from 'effect/testing';
import { describe, expect, it } from 'vitest';
import { Actor, History, Runtime, Snapshot } from '../index.ts';
import type { AnyActor, Entry } from '../types.ts';
import {
  Auth,
  settle,
  at,
  fork,
  line,
  ring,
  run,
  start,
  stop,
  tags,
  timed,
  to,
  started,
  heard,
  Timer,
  Metronome,
  historyOf,
  scoped,
  seek,
  send,
} from './fixtures.ts';

/*
 * The Runtime: Time, the one Mailbox, running or stopped, the Snapshot it
 * is made from and the ones it follows, and the History kept beside it,
 * which grows, Forks and Seeks.
 */

/** The Snapshot right after Messages Sent to the root from outside, all at one Time: played as data, nothing run. */
const after = <A extends AnyActor>(
  actor: A,
  time: number,
  ...messages: ReadonlyArray<{ readonly _tag: string }>
) =>
  messages.reduce(
    (snapshot, message) =>
      Snapshot.next(actor, snapshot, {
        to: snapshot.root.address,
        message,
        from: { kind: 'outside' },
        at: time,
      }).snapshot,
    Snapshot.init(actor),
  );

/** Follow a Snapshot, from Effect code. */
const follow = <A extends AnyActor>(
  app: Runtime<A>,
  snapshot: Snapshot<A>,
  options?: { readonly restart?: boolean },
) => Effect.promise(() => app.follow(snapshot, options));

/** Work that says when it starts and when it stops. */
const noted = (name: string) =>
  Effect.acquireRelease(
    Effect.sync(() => void heard.push(`${name} started`)),
    () => Effect.sync(() => void heard.push(`${name} stopped`)),
  ).pipe(Effect.andThen(Effect.never));

const Lamp = Actor.define('Lamp', {}).build({
  workers: { glow: { run: (self) => noted(`${self.id} glow`) } },
});

/**
 * By day: the power, the heating, a porch Lamp and a guest's Lamp. By
 * night: the power, the alarm and the porch Lamp; and Night asks for a
 * Command.
 */
const House = Actor.define('House', {
  model: Schema.Struct({ night: Schema.Boolean }),
  message: Schema.TaggedUnion({ Night: {}, Rang: {} }),
}).build({
  init: () => ({ model: { night: false } }),
  children: {
    porch: Actor.child(Lamp),
    guest: Actor.child(Lamp, { while: ({ model }) => !model.night }),
  },
  on: {
    Night: () => ({ model: { night: true }, command: ring() }),
    Rang: () => ({}),
  },
  workers: {
    power: { run: () => noted('power') },
    heating: {
      while: ({ model }) => !model.night,
      run: () => noted('heating'),
    },
    alarm: { while: ({ model }) => model.night, run: () => noted('alarm') },
  },
});

/** The House by night, as data: the Update that made it asked for a Command. */
const night = () => {
  const day = Snapshot.init(House);
  const played = Snapshot.next(House, day, {
    to: day.root.address,
    message: { _tag: 'Night' },
    from: { kind: 'outside' },
    at: 40,
  });
  expect(played.commands).toHaveLength(1);
  return played.snapshot;
};

/** A House by day, its work started, and nothing heard yet. */
const byDay = Effect.gen(function* () {
  heard.length = 0;
  const app = yield* scoped(House);
  yield* settle;
  expect([...heard].sort()).toEqual([
    'House/guest#1 glow started',
    'House/porch#1 glow started',
    'heating started',
    'power started',
  ]);
  heard.length = 0;
  return app;
});

/** A Worker that Sends as it starts, while the Message that started it is still being played. */
const Relay = Actor.define('Relay', {
  model: Schema.Struct({ on: Schema.Boolean, echoes: Schema.Number }),
  message: Schema.TaggedUnion({ On: {}, Off: {}, Echoed: {} }),
}).build({
  init: () => ({ model: { on: false, echoes: 0 } }),
  on: {
    On: (_, { model }) => ({ model: { ...model, on: true } }),
    Off: (_, { model }) => ({ model: { ...model, on: false } }),
    Echoed: (_, { model }) => ({
      model: { ...model, echoes: model.echoes + 1 },
    }),
  },
  workers: {
    echo: {
      while: ({ model }) => model.on,
      run: (self) =>
        self.send({ _tag: 'Echoed' }).pipe(Effect.andThen(Effect.never)),
    },
  },
});

describe('Time', () => {
  it('stamps each Message with when it was sent, and hands it to Update', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* started;
        yield* settle;
        yield* TestClock.adjust('250 millis');
        send(app, 'Auth/Anonymous:login#1', {
          _tag: 'Typed',
          name: 'ada',
        });

        expect(app.now()).toBe(250);
        expect(line(app).map((e) => e.at)).toEqual([0, 250]);
        expect(at(app, 'Auth/Anonymous:login#1').model).toMatchObject({
          typedAt: 250,
        });
      }),
    ));

  it('stands still while the Runtime is stopped, and carries on from there', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* scoped(Timer);
        yield* TestClock.adjust('300 millis');
        app.root.send({ _tag: 'Rang' });
        yield* TestClock.adjust('100 millis');
        expect(app.now()).toBe(400);
        yield* stop(app);
        yield* TestClock.adjust('500 millis');
        expect(app.now()).toBe(400);
        yield* start(app);
        expect(app.now()).toBe(400);
        yield* TestClock.adjust('200 millis');
        app.root.send({ _tag: 'Rang' });
        expect(line(app).map((e) => e.at)).toEqual([300, 600]);
      }),
    ));

  it('stands still in a Runtime made stopped, until it starts', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Timer, {
          snapshot: after(Timer, 40, { _tag: 'Rang' }),
          running: false,
        });
        expect(app.now()).toBe(40);
        yield* TestClock.adjust('500 millis');
        expect(app.now()).toBe(40);
        yield* start(app);
        yield* TestClock.adjust('100 millis');
        expect(app.now()).toBe(140);
      }),
    ));

  it('carries on from the Time of a Snapshot followed', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* scoped(Timer);
        const early = after(Timer, 40, { _tag: 'Rang' });
        expect(early.at).toBe(40);
        yield* TestClock.adjust('500 millis');
        expect(app.now()).toBe(500);

        yield* follow(app, early);
        expect(app.now()).toBe(40);
        yield* TestClock.adjust('100 millis');
        expect(app.now()).toBe(140);
        app.root.send({ _tag: 'Rang' });
        expect(line(app).at(-1)?.at).toBe(140);
        expect(app.snapshot.at).toBe(140);

        // Starting again from it, the same.
        yield* follow(app, early, { restart: true });
        expect(app.now()).toBe(40);
        yield* TestClock.adjust('60 millis');
        expect(app.now()).toBe(100);

        // Stopped, it stands still at the Snapshot's Time, and carries on from there.
        yield* stop(app);
        yield* follow(app, Snapshot.init(Timer));
        expect(app.now()).toBe(0);
        yield* TestClock.adjust('500 millis');
        expect(app.now()).toBe(0);
        yield* start(app);
        yield* TestClock.adjust('25 millis');
        expect(app.now()).toBe(25);
      }),
    ));
});

describe('the mailbox', () => {
  it('tells subscribers once the queue is empty', () =>
    run(
      Effect.gen(function* () {
        const Echo = Actor.define('Echo', {
          model: Schema.Struct({ n: Schema.Number }),
          message: Schema.TaggedUnion({ Ping: {}, Pong: {} }),
        }).build({
          init: () => ({ model: { n: 0 } }),
          workers: {
            echo: {
              run: (self) =>
                self.changes.pipe(
                  Stream.filter(({ model }) => model.n === 1),
                  Stream.runForEach(() => self.send({ _tag: 'Pong' })),
                ),
            },
          },
          on: {
            Ping: (_, { model }) => ({ model: { n: model.n + 1 } }),
            Pong: (_, { model }) => ({ model: { n: model.n + 10 } }),
          },
        });
        const app = yield* scoped(Echo);
        yield* settle;
        let told = 0;
        app.subscribe(() => told++);
        app.root.send({ _tag: 'Ping' });
        expect(told).toBe(1);
        yield* settle;
        expect(app.snapshot.root.model).toEqual({ n: 11 });
      }),
    ));

  it('tells subscribers the entries played, in order, once each time the queue empties', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Relay);
        const told: Array<ReadonlyArray<Entry>> = [];
        app.subscribe((entries) => told.push(entries));
        yield* TestClock.adjust('50 millis');

        // The Worker Sent as it started, while `On` was being played: one queue, told once.
        app.root.send({ _tag: 'On' });
        expect(told).toEqual([
          [
            {
              to: 'Relay',
              message: { _tag: 'On' },
              from: { kind: 'outside' },
              at: 50,
            },
            {
              to: 'Relay',
              message: { _tag: 'Echoed' },
              from: { kind: 'worker', instance: 'Relay', name: 'echo' },
              at: 50,
            },
          ],
        ]);
        expect(app.snapshot.root.model).toEqual({ on: true, echoes: 1 });

        // The next queue is told alone: no entry is told twice.
        app.root.send({ _tag: 'Off' });
        expect(told.map((batch) => batch.map((e) => e.message._tag))).toEqual([
          ['On', 'Echoed'],
          ['Off'],
        ]);
      }),
    ));

  it('tells subscribers of every stop, start and Snapshot followed, and of being let go, with no entry', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Relay);
        const told: Array<ReadonlyArray<Entry>> = [];
        app.subscribe((entries) => told.push(entries));
        /** Told since last asked: at least once, and never an entry. */
        const toldNothing = () => {
          const since = told.splice(0);
          expect(since.length).toBeGreaterThan(0);
          expect(since.flat()).toEqual([]);
        };
        expect(told).toEqual([]);

        yield* stop(app);
        toldNothing();
        yield* start(app);
        toldNothing();
        yield* follow(app, after(Relay, 10, { _tag: 'Off' }));
        toldNothing();
        yield* follow(app, Snapshot.init(Relay), { restart: true });
        toldNothing();
        yield* Effect.promise(() => app.dispose());
        toldNothing();
      }),
    ));

  it('made stopped, a listener subscribed before start() is told the entries Workers Send as they start', () =>
    timed(
      Effect.gen(function* () {
        const on = after(Relay, 0, { _tag: 'On' });
        const app = yield* Runtime.scoped(Relay, {
          snapshot: on,
          running: false,
        });
        const told: Array<Entry> = [];
        app.subscribe((entries) => told.push(...entries));
        expect(told).toEqual([]);

        // It runs at once: the Worker has started, and Sent, when `start` returns.
        void app.start();
        expect(app.running).toBe(true);
        expect(told).toEqual([
          {
            to: 'Relay',
            message: { _tag: 'Echoed' },
            from: { kind: 'worker', instance: 'Relay', name: 'echo' },
            at: 0,
          },
        ]);
        expect(app.snapshot.root.model).toEqual({ on: true, echoes: 1 });

        // Made running, the Worker has Sent before anyone could subscribe.
        const late = yield* Runtime.scoped(Relay, { snapshot: on });
        const missed: Array<Entry> = [];
        late.subscribe((entries) => missed.push(...entries));
        expect(late.snapshot.root.model).toEqual({ on: true, echoes: 1 });
        expect(missed).toEqual([]);
      }),
    ));

  it('refuses every Message once the Runtime is let go', () =>
    run(
      Effect.gen(function* () {
        const app = yield* scoped(Timer);
        yield* Effect.promise(() => app.dispose());
        expect(app.root.send({ _tag: 'Rang' })).toBe('refused');
        expect(History.all(historyOf(app))).toHaveLength(0);
      }),
    ));
});

describe('running or stopped', () => {
  it('runs from the moment it is made', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Metronome);
        expect(app.running).toBe(true);
        yield* TestClock.adjust('250 millis');
        expect(app.snapshot.root.model).toEqual({ beats: 2 });
        expect(app.root.workers.map((worker) => worker.name).sort()).toEqual([
          'alive',
          'beat',
        ]);
      }),
    ));

  it('stop() ends every Worker and Command, and a Send is refused, adding nothing', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* scoped(Metronome);
        yield* TestClock.adjust('250 millis');
        app.root.send({ _tag: 'Ping' });
        heard.length = 0;
        yield* stop(app);
        expect(app.running).toBe(false);
        expect(heard).toEqual(['rested', 'gone']);

        const before = app.snapshot;
        expect(app.root.send({ _tag: 'Beat' })).toBe('refused');
        expect(app.snapshot).toBe(before);
        yield* TestClock.adjust('2 seconds');
        expect(tags(app)).toEqual(['Beat', 'Beat', 'Ping']);
        expect(app.root.workers).toEqual([]);
        // The Ping's Command ended with the rest, and never answered.
        expect(heard).toEqual(['rested', 'gone']);
      }),
    ));

  it('start() starts the Workers its Snapshot asks for, and runs no past Command', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* scoped(Timer);
        app.root.send({ _tag: 'Wait' });
        app.root.send({ _tag: 'Stream' });
        yield* stop(app);
        yield* start(app);
        expect(app.running).toBe(true);
        expect(app.root.workers).toMatchObject([
          { name: 'stream', status: 'running' },
        ]);
        yield* TestClock.adjust('2 seconds');
        // The Worker streamed again from the start; the Wait never rang.
        expect(tags(app)).toEqual([
          'Wait',
          'Stream',
          'Chunk',
          'Chunk',
          'Chunk',
          'Streamed',
        ]);
      }),
    ));

  it('made stopped, holds its Snapshot and runs nothing until it starts', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* scoped(Metronome, {
          running: false,
          layer: Layer.empty,
        });
        expect(app.running).toBe(false);
        expect(app.snapshot).toBe(Snapshot.init(Metronome));
        expect(app.snapshot.root.state._tag).toBe('Running');
        yield* TestClock.adjust('250 millis');
        expect(tags(app)).toEqual([]);
        expect(app.root.workers).toEqual([]);
        expect(app.root.send({ _tag: 'Beat' })).toBe('refused');
        expect(tags(app)).toEqual([]);

        // It runs at once: its Workers have started when `start` returns.
        void app.start();
        expect(app.running).toBe(true);
        expect(app.root.workers.map((worker) => worker.name).sort()).toEqual([
          'alive',
          'beat',
        ]);
        yield* TestClock.adjust('250 millis');
        expect(tags(app)).toEqual(['Beat', 'Beat']);

        // Stopped or not, an Actor that Requires a Capability is made with the Layer.
        // @ts-expect-error Auth Requires a Server
        void (() => Runtime.make(Auth, { running: false }));
      }),
    ));
});

describe('made from a Snapshot', () => {
  it('runs from it, at its Time, and none of the Commands that made it', () =>
    timed(
      Effect.gen(function* () {
        const first = yield* scoped(Timer);
        yield* TestClock.adjust('300 millis');
        first.root.send({ _tag: 'Wait' });
        const app = yield* scoped(Timer, { snapshot: first.snapshot });
        yield* stop(first);
        expect(app.snapshot).toBe(first.snapshot);
        expect(app.now()).toBe(300);
        expect(app.running).toBe(true);
        yield* TestClock.adjust('2 seconds');
        // The Wait's Command was the first Runtime's: here nothing rings.
        expect(tags(app)).toEqual([]);
        expect(app.snapshot).toBe(first.snapshot);
      }),
    ));

  it('runs the Workers a Snapshot played or loaded as data asks for', () =>
    timed(
      Effect.gen(function* () {
        const played = after(Timer, 40, { _tag: 'Stream' });
        const app = yield* scoped(Timer, { snapshot: played });
        expect(app.snapshot).toBe(played);
        expect(app.now()).toBe(40);
        expect(app.root.workers).toMatchObject([
          { name: 'stream', status: 'running' },
        ]);
        yield* TestClock.adjust('20 millis');
        expect(line(app).map((e) => [e.message._tag, e.at])).toEqual([
          ['Chunk', 50],
          ['Chunk', 60],
        ]);

        const loaded = Snapshot.load(Timer, Snapshot.save(Timer, app.snapshot));
        const again = yield* scoped(Timer, { snapshot: loaded });
        expect(again.snapshot).toBe(loaded);
        expect(again.snapshot).toEqual(app.snapshot);
        expect(again.now()).toBe(60);
        yield* stop(app);
        // Its Worker streams from the start again, on the data it was made from.
        yield* TestClock.adjust('30 millis');
        expect(again.snapshot.root.model).toEqual({
          chunks: [1, 2, 1, 2, 3],
          streaming: false,
        });
      }),
    ));

  it('is not made from a Snapshot whose root is another Actor’s', () => {
    const other = Snapshot.init(Metronome);
    // @ts-expect-error a Snapshot of Metronome is not one of Timer
    const made = () => Runtime.make(Timer, { snapshot: other });
    expect(made).toThrow(
      'a Runtime of Timer cannot run a Snapshot whose root is Metronome',
    );
  });
});

describe('following a Snapshot', () => {
  it('changes only what differs: work both Snapshots ask for is not touched, and no Command runs', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* byDay;
        const next = night();

        yield* follow(app, next);
        yield* settle;
        expect(app.snapshot).toBe(next);
        expect(app.running).toBe(true);
        // The power and the porch Lamp neither stopped nor started again.
        expect([...heard].sort()).toEqual([
          'House/guest#1 glow stopped',
          'alarm started',
          'heating stopped',
        ]);
        expect(app.root.workers).toEqual([
          { name: 'power', key: '', status: 'running' },
          { name: 'alarm', key: '', status: 'running' },
        ]);
        expect(app.at(to(app, 'House/guest#1'))).toBeUndefined();
        expect(app.at(to(app, 'House/porch#1'))?.workers).toEqual([
          { name: 'glow', key: '', status: 'running' },
        ]);

        // Night asked for a Command when it was played: following it runs none.
        yield* TestClock.adjust('2 seconds');
        expect(tags(app)).toEqual([]);
        expect(app.snapshot).toBe(next);

        // And back: the guest's Lamp is there again, its work started anew.
        heard.length = 0;
        yield* follow(app, Snapshot.init(House));
        yield* settle;
        expect([...heard].sort()).toEqual([
          'House/guest#1 glow started',
          'alarm stopped',
          'heating started',
        ]);
      }),
    ));

  it('with `restart`, stops every Worker and starts the ones the Snapshot asks for, and no Command runs', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* byDay;
        const next = night();

        yield* follow(app, next, { restart: true });
        yield* settle;
        expect(app.snapshot).toBe(next);
        expect(app.running).toBe(true);
        // Everything stopped before anything started.
        expect(heard.slice(0, 4).sort()).toEqual([
          'House/guest#1 glow stopped',
          'House/porch#1 glow stopped',
          'heating stopped',
          'power stopped',
        ]);
        expect(heard.slice(4).sort()).toEqual([
          'House/porch#1 glow started',
          'alarm started',
          'power started',
        ]);
        yield* TestClock.adjust('2 seconds');
        expect(tags(app)).toEqual([]);

        // The same Snapshot again: all of its work stops and starts again.
        heard.length = 0;
        yield* follow(app, next, { restart: true });
        yield* settle;
        expect(heard.slice(0, 3).sort()).toEqual([
          'House/porch#1 glow stopped',
          'alarm stopped',
          'power stopped',
        ]);
        expect(heard.slice(3).sort()).toEqual([
          'House/porch#1 glow started',
          'alarm started',
          'power started',
        ]);
      }),
    ));

  it('while stopped, only swaps the Snapshot; start() then runs it', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* byDay;
        yield* stop(app);
        heard.length = 0;
        const next = night();

        yield* follow(app, next);
        yield* settle;
        expect(app.snapshot).toBe(next);
        expect(app.running).toBe(false);
        expect(app.root.workers).toEqual([]);

        // Asked to restart, the same: there is no work to start again.
        const day = Snapshot.init(House);
        yield* follow(app, day, { restart: true });
        yield* settle;
        expect(app.snapshot).toBe(day);
        expect(app.running).toBe(false);
        expect(heard).toEqual([]);

        yield* follow(app, next);
        yield* start(app);
        yield* settle;
        expect(app.running).toBe(true);
        expect([...heard].sort()).toEqual([
          'House/porch#1 glow started',
          'alarm started',
          'power started',
        ]);
        yield* TestClock.adjust('2 seconds');
        expect(tags(app)).toEqual([]);
      }),
    ));

  it('rejects a Snapshot whose root is another Actor’s, and changes nothing', () =>
    run(
      Effect.gen(function* () {
        const app = yield* byDay;
        const before = app.snapshot;
        const failed = yield* Effect.promise(() =>
          // @ts-expect-error a Snapshot of Metronome is not one of House
          app.follow(Snapshot.init(Metronome)).then(
            () => undefined,
            (error: unknown) => error,
          ),
        );
        expect(failed).toBeInstanceOf(TypeError);
        expect(String(failed)).toContain(
          'a Runtime of House cannot run a Snapshot whose root is Metronome',
        );
        expect(app.snapshot).toBe(before);
        expect(app.running).toBe(true);
        expect(heard).toEqual([]);
      }),
    ));
});

describe('the History as a tree', () => {
  it('grows the Branch with each Message, after the Head', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* scoped(Timer);
        app.root.send({ _tag: 'Rang' });
        app.root.send({ _tag: 'Rang' });
        expect(line(app).map((e) => [e.id, e.parent])).toEqual([
          [0, null],
          [1, 0],
        ]);
        expect(historyOf(app).head).toBe(1);
        expect(History.children(historyOf(app), null).map((e) => e.id)).toEqual(
          [0],
        );
        expect(History.children(historyOf(app), 0).map((e) => e.id)).toEqual([
          1,
        ]);
      }),
    ));

  it('a Fork while running starts the work again from that entry, and the next Message grows a Branch', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* scoped(Metronome);
        yield* TestClock.adjust('350 millis');
        expect(line(app).map((e) => e.at)).toEqual([100, 200, 300]);
        heard.length = 0;

        yield* fork(app, 1);
        expect(heard).toEqual(['rested', 'gone']);
        expect(app.running).toBe(true);
        expect(historyOf(app).head).toBe(1);
        expect(app.now()).toBe(200);
        expect(app.snapshot.root.model).toEqual({ beats: 2 });

        yield* TestClock.adjust('100 millis');
        expect(line(app).map((e) => e.id)).toEqual([0, 1, 3]);
        expect(line(app)[2]).toMatchObject({ parent: 1, at: 300 });
        expect(History.children(historyOf(app), 1).map((e) => e.id)).toEqual([
          2, 3,
        ]);
        expect(History.tips(historyOf(app)).map((e) => e.id)).toEqual([2, 3]);
        expect(app.snapshot.root.model).toEqual({ beats: 3 });
      }),
    ));

  it('a Fork runs no Command again', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* scoped(Timer);
        app.root.send({ _tag: 'Wait' });
        yield* TestClock.adjust('1 second');
        expect(tags(app)).toEqual(['Wait', 'Rang']);

        yield* fork(app, 0);
        yield* TestClock.adjust('2 seconds');
        expect(tags(app)).toEqual(['Wait']);
        app.root.send({ _tag: 'Rang' });
        expect(History.tips(historyOf(app)).map((e) => e.id)).toEqual([1, 2]);
      }),
    ));

  it('a Fork rebuilds the same Instances, at the same Addresses', () =>
    run(
      Effect.gen(function* () {
        const app = yield* started;
        yield* settle;
        app.root.send({ _tag: 'LoggedIn', user: 'ada' });
        const todos = 'Auth/Authenticated:todos#1';
        send(app, todos, { _tag: 'Added', text: 'one' });
        yield* fork(app, 0);
        expect(app.snapshot.root.state._tag).toBe('Anonymous');
        // Gone with the Fork: nothing is there to Send to, and no entry is played.
        const before = historyOf(app);
        expect(app.at(to(app, todos))).toBeUndefined();
        expect(send(app, todos, { _tag: 'Added', text: 'stale' })).toBe(
          'refused',
        );
        expect(historyOf(app)).toBe(before);
        yield* settle;
        app.root.send({ _tag: 'LoggedIn', user: 'bob' });
        expect(at(app, todos).model).toEqual({ items: [] });
      }),
    ));

  it('a Fork while stopped only moves the Head', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* scoped(Metronome);
        yield* TestClock.adjust('250 millis');
        yield* stop(app);
        yield* fork(app, null);
        expect(app.running).toBe(false);
        expect(historyOf(app).head).toBe(null);
        expect(app.snapshot.root.model).toEqual({ beats: 0 });
        expect(app.now()).toBe(0);
        yield* TestClock.adjust('500 millis');
        expect(History.all(historyOf(app))).toHaveLength(2);
        expect(app.root.workers).toEqual([]);

        yield* start(app);
        yield* TestClock.adjust('100 millis');
        expect(line(app).map((e) => [e.id, e.parent, e.at])).toEqual([
          [2, null, 100],
        ]);
      }),
    ));

  it('a Fork to an entry the History does not have fails and changes nothing', () =>
    run(
      Effect.gen(function* () {
        const app = yield* scoped(Timer);
        app.root.send({ _tag: 'Rang' });
        const before = historyOf(app);
        const snapshot = app.snapshot;
        const failed = yield* Effect.exit(fork(app, 99));
        expect(Exit.isFailure(failed) && String(failed.cause)).toContain(
          'no History entry 99',
        );
        expect(() => History.move(before, 99)).toThrow(RangeError);
        expect(historyOf(app)).toBe(before);
        expect(app.snapshot).toBe(snapshot);
        expect(app.running).toBe(true);
      }),
    ));
});

describe('Seek', () => {
  it('gives the Snapshot right after any entry as plain data, and changes nothing', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* scoped(Metronome);
        yield* TestClock.adjust('250 millis');
        const history = historyOf(app);
        const first = seek(app, 0);
        expect(Object.keys(first).sort()).toEqual(['at', 'root']);
        expect(first.at).toBe(100);
        expect(first.root.model).toEqual({ beats: 1 });
        expect(seek(app, null).at).toBe(0);
        expect(seek(app, null).root.model).toEqual({ beats: 0 });
        expect(historyOf(app)).toBe(history);
        expect(app.running).toBe(true);

        yield* TestClock.adjust('100 millis');
        expect(app.snapshot.root.model).toEqual({ beats: 3 });
        expect(seek(app, historyOf(app).head)).toEqual(app.snapshot);
        // A Snapshot is a picture: the Runtime moving on changes nothing in it.
        expect(first.root.model).toEqual({ beats: 1 });
        expect(() => seek(app, 99)).toThrow(RangeError);
      }),
    ));

  it('reaches every Branch, while stopped too', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* scoped(Metronome);
        yield* TestClock.adjust('350 millis');
        yield* fork(app, 0);
        yield* TestClock.adjust('100 millis');
        yield* stop(app);
        expect(History.tips(historyOf(app)).map((e) => e.id)).toEqual([2, 3]);
        expect(seek(app, 2).root.model).toEqual({ beats: 3 });
        expect(seek(app, 3).root.model).toEqual({ beats: 2 });
        expect(historyOf(app).head).toBe(3);
      }),
    ));

  it('rebuilds the Snapshot at any Step from init and Update alone', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* started;
        const later = TestClock.adjust('10 millis');
        yield* settle;
        yield* later;
        const login = to(app, 'Auth/Anonymous:login#1');
        send(app, login, { _tag: 'Typed', name: 'ada' });
        yield* later;
        send(app, login, { _tag: 'Submitted' });
        yield* settle;
        yield* later;
        const todos = to(app, 'Auth/Authenticated:todos#1');
        send(app, todos, { _tag: 'Added', text: 'one' });
        yield* later;
        send(app, todos, { _tag: 'Quit' });
        yield* settle;
        expect(line(app).length).toBe(7);

        // Played again from a History loaded fresh, nothing remembered.
        const history = History.load(Auth, History.save(Auth, historyOf(app)));
        const step = (n: number) =>
          History.snapshot(Auth, history, n === 0 ? null : n - 1);
        expect(step(0).root.state._tag).toBe('Checking');
        expect(Snapshot.at(step(2), login)?.model).toMatchObject({
          name: 'ada',
        });
        expect(step(4).root.state._tag).toBe('Authenticated');
        expect(Snapshot.at(step(5), todos)?.model).toEqual({ items: ['one'] });
        expect(step(7).root.state._tag).toBe('Anonymous');
        expect(Snapshot.at(step(4), todos)?.model).toEqual({ items: [] });
        expect(step(7)).toEqual(app.snapshot);
        expect(yield* History.replay(Auth, history)).toEqual(app.snapshot);
      }),
    ));
});
