import { Effect, Schema, Stream } from 'effect';
import { TestClock } from 'effect/testing';
import { describe, expect, it } from 'vitest';
import { Actor, Replay, Runtime, instanceAt } from '../index.ts';
import type { Running } from '../index.ts';
import {
  Auth,
  settle,
  at,
  run,
  timed,
  started,
  heard,
  Timer,
  Metronome,
} from './fixtures.ts';

/* The Runtime: Time, the one Mailbox, and the History it writes, stops and branches. */

describe('Time', () => {
  it('stamps each Message with when it was sent, and hands it to Update', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* started;
        yield* settle;
        yield* TestClock.adjust('250 millis');
        app.send('Auth/login#1', { _tag: 'Typed', name: 'ada' });

        expect(app.now()).toBe(250);
        expect(app.history.branch().map((e) => e.at)).toEqual([0, 250]);
        expect(at(app, 'Auth/login#1').model).toMatchObject({ typedAt: 250 });
      }),
    ));
});

describe('the mailbox', () => {
  it('tells subscribers once the queue is empty', () =>
    run(
      Effect.gen(function* () {
        const Echo = Actor.build(
          Actor.define('Echo', {
            model: Schema.Struct({ n: Schema.Number }),
            message: Schema.TaggedUnion({ Ping: {}, Pong: {} }),
          }),
          {
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
          },
        );
        const app = yield* Runtime.start(Echo);
        yield* settle;
        let told = 0;
        app.subscribe(() => told++);
        app.send('Echo', { _tag: 'Ping' });
        expect(told).toBe(1);
        yield* settle;
        expect(app.snapshot().model).toEqual({ n: 11 });
      }),
    ));
});

describe('the History as a tree', () => {
  const tags = (app: Running<unknown>) =>
    app.history.branch().map((e) => e.message._tag);

  it('grows the Branch with each Message, after the Head', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Timer);
        app.send('Timer', { _tag: 'Rang' });
        app.send('Timer', { _tag: 'Rang' });
        expect(app.history.branch().map((e) => [e.id, e.parent])).toEqual([
          [0, null],
          [1, 0],
        ]);
        expect(app.history.head()).toBe(1);
        expect(app.history.children(null).map((e) => e.id)).toEqual([0]);
        expect(app.history.children(0).map((e) => e.id)).toEqual([1]);
      }),
    ));

  it('stop closes every Worker and Command, and Time stands still', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Metronome);
        yield* TestClock.adjust('250 millis');
        app.send('Metronome', { _tag: 'Ping' });
        heard.length = 0;
        yield* app.stop();
        expect(app.running()).toBe(false);
        expect(heard).toEqual(['rested', 'gone']);

        yield* TestClock.adjust('2 seconds');
        app.send('Metronome', { _tag: 'Ping' });
        expect(tags(app)).toEqual(['Beat', 'Beat', 'Ping']);
        expect(app.now()).toBe(250);
        expect(heard).toEqual(['rested', 'gone']);
      }),
    ));

  it('start(from) grows a new Branch from an entry, and the old one stays', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Metronome);
        yield* TestClock.adjust('350 millis');
        expect(app.history.branch().map((e) => e.at)).toEqual([100, 200, 300]);
        yield* app.stop();
        yield* TestClock.adjust('1 second');

        yield* app.start(1);
        expect(app.history.head()).toBe(1);
        expect(app.running()).toBe(true);
        expect(app.now()).toBe(200);
        expect(app.snapshot().model).toEqual({ beats: 2 });

        yield* TestClock.adjust('100 millis');
        expect(app.history.branch().map((e) => e.id)).toEqual([0, 1, 3]);
        expect(app.history.branch()[2]).toMatchObject({ parent: 1, at: 300 });
        expect(app.history.children(1).map((e) => e.id)).toEqual([2, 3]);
        expect(app.snapshot().model).toEqual({ beats: 3 });
      }),
    ));

  it("start() resumes the Branch from its Head, at the Head's Time", () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Metronome);
        yield* TestClock.adjust('250 millis');
        yield* app.stop();
        yield* TestClock.adjust('1 second');
        yield* app.start();
        expect(app.now()).toBe(200);
        yield* TestClock.adjust('100 millis');
        expect(app.history.branch().map((e) => [e.id, e.parent, e.at])).toEqual(
          [
            [0, null, 100],
            [1, 0, 200],
            [2, 1, 300],
          ],
        );
      }),
    ));

  it('starting while running stops first', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Metronome);
        yield* TestClock.adjust('250 millis');
        yield* app.start(null);
        expect(app.now()).toBe(0);
        expect(app.snapshot().model).toEqual({ beats: 0 });
        yield* TestClock.adjust('100 millis');
        expect(app.history.children(null).map((e) => e.id)).toEqual([0, 2]);
      }),
    ));

  it('tells the Snapshot right after an entry on another Branch', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Metronome);
        yield* TestClock.adjust('350 millis');
        yield* app.start(0);
        expect((yield* app.history.seek(2)).model).toEqual({ beats: 3 });
        expect(app.snapshot().model).toEqual({ beats: 1 });
      }),
    ));

  it('keeps its Head while the Runtime runs on it', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Metronome);
        yield* TestClock.adjust('250 millis');
        expect(() => app.history.moveHead(0)).toThrow('stop the Runtime');
        yield* app.stop();
        app.history.moveHead(0);
        yield* app.start();
        expect(app.snapshot().model).toEqual({ beats: 1 });
      }),
    ));

  it('a fork rebuilds the same Instances, with the same IDs', () =>
    run(
      Effect.gen(function* () {
        const app = yield* started;
        yield* settle;
        app.send('Auth', { _tag: 'LoggedIn', user: 'ada' });
        app.send('Auth/todos#1', { _tag: 'Added', text: 'one' });
        yield* app.start(0);
        expect(app.snapshot().state._tag).toBe('Anonymous');
        app.send('Auth/todos#1', { _tag: 'Added', text: 'stale' });
        expect(app.history.outcome(app.history.branch().at(-1)!.id)).toBe(
          'dropped',
        );
        yield* settle;
        app.send('Auth', { _tag: 'LoggedIn', user: 'bob' });
        expect(at(app, 'Auth/todos#1').model).toEqual({ items: [] });
      }),
    ));
});

describe('Replay', () => {
  it('rebuilds the Snapshot at any Step from init and Update alone', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* started;
        const later = TestClock.adjust('10 millis');
        yield* settle;
        yield* later;
        app.send('Auth/login#1', { _tag: 'Typed', name: 'ada' });
        yield* later;
        app.send('Auth/login#1', { _tag: 'Submitted' });
        yield* settle;
        yield* later;
        app.send('Auth/todos#1', { _tag: 'Added', text: 'one' });
        yield* later;
        app.send('Auth/todos#1', { _tag: 'Quit' });
        yield* settle;
        expect(app.history.branch().length).toBe(7);

        const replay = Replay.make(Auth.definition, undefined, { every: 2 });
        const step = (n: number) =>
          replay.seek(app.history.branch().slice(0, n));
        expect((yield* step(0)).state._tag).toBe('Checking');
        expect(instanceAt(yield* step(2), 'Auth/login#1')?.model).toMatchObject(
          { name: 'ada' },
        );
        expect((yield* step(4)).state._tag).toBe('Authenticated');
        expect(instanceAt(yield* step(5), 'Auth/todos#1')?.model).toEqual({
          items: ['one'],
        });
        expect((yield* step(7)).state._tag).toBe('Anonymous');
        // Back again, from a saved Snapshot.
        expect(instanceAt(yield* step(4), 'Auth/todos#1')?.model).toEqual({
          items: [],
        });
        expect(yield* step(7)).toEqual(app.snapshot());
      }),
    ));
});
