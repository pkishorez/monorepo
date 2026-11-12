import { Effect, Schema, Stream } from 'effect';
import { TestClock } from 'effect/testing';
import { describe, expect, it } from 'vitest';
import { Actor, History, Runtime, Snapshot, Stopped } from '../index.ts';
import {
  Auth,
  settle,
  at,
  fork,
  line,
  outcome,
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
} from './fixtures.ts';

/* The Runtime: Time, the one Mailbox, running or stopped, and the History it grows, Forks and Seeks. */

describe('Time', () => {
  it('stamps each Message with when it was sent, and hands it to Update', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* started;
        yield* settle;
        yield* TestClock.adjust('250 millis');
        app.send(to(app, 'Auth/Anonymous:login#1'), {
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
        const app = yield* Runtime.scoped(Timer);
        yield* TestClock.adjust('300 millis');
        app.send(app.snapshot.root.address, { _tag: 'Rang' });
        yield* TestClock.adjust('100 millis');
        expect(app.now()).toBe(400);
        yield* stop(app);
        yield* TestClock.adjust('500 millis');
        expect(app.now()).toBe(400);
        yield* start(app);
        expect(app.now()).toBe(400);
        yield* TestClock.adjust('200 millis');
        app.send(app.snapshot.root.address, { _tag: 'Rang' });
        expect(line(app).map((e) => e.at)).toEqual([300, 600]);
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
        const app = yield* Runtime.scoped(Echo);
        yield* settle;
        let told = 0;
        app.subscribe(() => told++);
        app.send(app.snapshot.root.address, { _tag: 'Ping' });
        expect(told).toBe(1);
        yield* settle;
        expect(app.snapshot.root.model).toEqual({ n: 11 });
      }),
    ));

  it('refuses every Message once the Runtime is let go', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Timer);
        yield* Effect.promise(() => app.dispose());
        expect(app.send(app.snapshot.root.address, { _tag: 'Rang' })).toBe(
          'refused',
        );
        expect(app.history.entries).toHaveLength(0);
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
        expect(tags(app)).toEqual(['Beat', 'Beat']);
        expect(
          app
            .workers(app.snapshot.root.address)
            .map((worker) => worker.name)
            .sort(),
        ).toEqual(['alive', 'beat']);
      }),
    ));

  it('stop() ends every Worker and Command, and a Send throws Stopped, adding nothing', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Metronome);
        yield* TestClock.adjust('250 millis');
        app.send(app.snapshot.root.address, { _tag: 'Ping' });
        heard.length = 0;
        yield* stop(app);
        expect(app.running).toBe(false);
        expect(heard).toEqual(['rested', 'gone']);

        expect(() =>
          app.send(app.snapshot.root.address, { _tag: 'Beat' }),
        ).toThrow(Stopped);
        yield* TestClock.adjust('2 seconds');
        expect(tags(app)).toEqual(['Beat', 'Beat', 'Ping']);
        expect(app.workers(app.snapshot.root.address)).toEqual([]);
        // The Ping's Command ended with the rest, and never answered.
        expect(heard).toEqual(['rested', 'gone']);
      }),
    ));

  it('start() starts the Workers from the Head’s data, and runs no past Command', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Timer);
        app.send(app.snapshot.root.address, { _tag: 'Wait' });
        app.send(app.snapshot.root.address, { _tag: 'Stream' });
        yield* stop(app);
        yield* start(app);
        expect(app.running).toBe(true);
        expect(app.workers(app.snapshot.root.address)).toMatchObject([
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

  it('made on a History, runs at its Head and none of its Commands', () =>
    timed(
      Effect.gen(function* () {
        const first = yield* Runtime.scoped(Timer);
        first.send(first.snapshot.root.address, { _tag: 'Wait' });
        const app = yield* Runtime.scoped(Timer, { history: first.history });
        yield* stop(first);
        yield* TestClock.adjust('2 seconds');
        expect(app.running).toBe(true);
        expect(tags(app)).toEqual(['Wait']);
      }),
    ));
});

describe('the History as a tree', () => {
  it('grows the Branch with each Message, after the Head', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Timer);
        app.send(app.snapshot.root.address, { _tag: 'Rang' });
        app.send(app.snapshot.root.address, { _tag: 'Rang' });
        expect(line(app).map((e) => [e.id, e.parent])).toEqual([
          [0, null],
          [1, 0],
        ]);
        expect(app.history.head).toBe(1);
        expect(History.children(app.history, null).map((e) => e.id)).toEqual([
          0,
        ]);
        expect(History.children(app.history, 0).map((e) => e.id)).toEqual([1]);
      }),
    ));

  it('a Fork while running starts the work again from that entry, and the next Message grows a Branch', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Metronome);
        const held = { runtime: app };
        yield* TestClock.adjust('350 millis');
        expect(line(app).map((e) => e.at)).toEqual([100, 200, 300]);
        heard.length = 0;

        yield* fork(app, 1);
        expect(heard).toEqual(['rested', 'gone']);
        expect(held.runtime).toBe(app);
        expect(app.running).toBe(true);
        expect(app.history.head).toBe(1);
        expect(app.now()).toBe(200);
        expect(app.snapshot.root.model).toEqual({ beats: 2 });

        yield* TestClock.adjust('100 millis');
        expect(line(app).map((e) => e.id)).toEqual([0, 1, 3]);
        expect(line(app)[2]).toMatchObject({ parent: 1, at: 300 });
        expect(History.children(app.history, 1).map((e) => e.id)).toEqual([
          2, 3,
        ]);
        expect(History.tips(app.history).map((e) => e.id)).toEqual([2, 3]);
        expect(app.snapshot.root.model).toEqual({ beats: 3 });
      }),
    ));

  it('a Fork runs no Command again', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Timer);
        app.send(app.snapshot.root.address, { _tag: 'Wait' });
        yield* TestClock.adjust('1 second');
        expect(tags(app)).toEqual(['Wait', 'Rang']);

        yield* fork(app, 0);
        yield* TestClock.adjust('2 seconds');
        expect(tags(app)).toEqual(['Wait']);
        app.send(app.snapshot.root.address, { _tag: 'Rang' });
        expect(History.tips(app.history).map((e) => e.id)).toEqual([1, 2]);
      }),
    ));

  it('a Fork rebuilds the same Instances, at the same Addresses', () =>
    run(
      Effect.gen(function* () {
        const app = yield* started;
        yield* settle;
        app.send(app.snapshot.root.address, { _tag: 'LoggedIn', user: 'ada' });
        const todos = to(app, 'Auth/Authenticated:todos#1');
        app.send(todos, { _tag: 'Added', text: 'one' });
        yield* fork(app, 0);
        expect(app.snapshot.root.state._tag).toBe('Anonymous');
        expect(app.send(todos, { _tag: 'Added', text: 'stale' })).toBe(
          'refused',
        );
        expect(outcome(app, app.history.head!)).toBe('dropped');
        yield* settle;
        app.send(app.snapshot.root.address, {
          _tag: 'LoggedIn',
          user: 'bob',
        });
        expect(at(app, 'Auth/Authenticated:todos#1').model).toEqual({
          items: [],
        });
      }),
    ));

  it('a Fork while stopped only moves the Head', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Metronome);
        yield* TestClock.adjust('250 millis');
        yield* stop(app);
        yield* fork(app, null);
        expect(app.running).toBe(false);
        expect(app.history.head).toBe(null);
        expect(app.snapshot.root.model).toEqual({ beats: 0 });
        expect(app.now()).toBe(0);
        yield* TestClock.adjust('500 millis');
        expect(app.history.entries).toHaveLength(2);
        expect(app.workers(app.snapshot.root.address)).toEqual([]);

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
        const app = yield* Runtime.scoped(Timer);
        app.send(app.snapshot.root.address, { _tag: 'Rang' });
        const before = app.history;
        const failed = yield* Effect.promise(() =>
          app.fork(99).then(
            () => undefined,
            (error: unknown) => error,
          ),
        );
        expect(failed).toBeInstanceOf(RangeError);
        expect(app.history).toBe(before);
        expect(app.running).toBe(true);
      }),
    ));
});

describe('Seek', () => {
  it('gives any Step as plain data, and changes nothing', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Metronome);
        yield* TestClock.adjust('250 millis');
        const history = app.history;
        const step = app.seek(0);
        expect(Object.keys(step).sort()).toEqual(['at', 'entry', 'snapshot']);
        expect(step).toMatchObject({ entry: 0, at: 100 });
        expect(step.snapshot.root.model).toEqual({ beats: 1 });
        expect(app.seek(null)).toMatchObject({ entry: null, at: 0 });
        expect(app.seek(null).snapshot.root.model).toEqual({ beats: 0 });
        expect(app.history).toBe(history);
        expect(app.running).toBe(true);

        yield* TestClock.adjust('100 millis');
        expect(app.snapshot.root.model).toEqual({ beats: 3 });
        expect(app.seek(app.history.head).snapshot).toEqual(app.snapshot);
        // A Step is a picture: the Runtime moving on changes nothing in it.
        expect(step.snapshot.root.model).toEqual({ beats: 1 });
        expect(() => app.seek(99)).toThrow(RangeError);
      }),
    ));

  it('reaches every Branch, while stopped too', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Metronome);
        yield* TestClock.adjust('350 millis');
        yield* fork(app, 0);
        yield* TestClock.adjust('100 millis');
        yield* stop(app);
        expect(History.tips(app.history).map((e) => e.id)).toEqual([2, 3]);
        expect(app.seek(2).snapshot.root.model).toEqual({ beats: 3 });
        expect(app.seek(3).snapshot.root.model).toEqual({ beats: 2 });
        expect(app.history.head).toBe(3);
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
        app.send(login, { _tag: 'Typed', name: 'ada' });
        yield* later;
        app.send(login, { _tag: 'Submitted' });
        yield* settle;
        yield* later;
        const todos = to(app, 'Auth/Authenticated:todos#1');
        app.send(todos, { _tag: 'Added', text: 'one' });
        yield* later;
        app.send(todos, { _tag: 'Quit' });
        yield* settle;
        expect(line(app).length).toBe(7);

        // Played again from a History loaded fresh, nothing remembered.
        const history = History.load(Auth, History.save(Auth, app.history));
        const step = (n: number) =>
          Snapshot.replay(Auth, history, n === 0 ? null : n - 1);
        expect(step(0).root.state._tag).toBe('Checking');
        expect(Snapshot.at(step(2), login)?.model).toMatchObject({
          name: 'ada',
        });
        expect(step(4).root.state._tag).toBe('Authenticated');
        expect(Snapshot.at(step(5), todos)?.model).toEqual({ items: ['one'] });
        expect(step(7).root.state._tag).toBe('Anonymous');
        expect(Snapshot.at(step(4), todos)?.model).toEqual({ items: [] });
        expect(step(7)).toEqual(app.snapshot);
        expect(yield* Snapshot.seek(Auth, history)).toEqual(app.snapshot);
      }),
    ));
});
