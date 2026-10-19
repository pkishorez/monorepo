import { Effect } from 'effect';
import { TestClock } from 'effect/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Actor, History, Runtime } from '../index.ts';
import {
  settle,
  run,
  timed,
  heard,
  Timer,
  Metronome,
  Uploads,
  Once,
  Alarm,
} from './fixtures.ts';

/* Workers: work that runs for exactly as long as its Condition holds. */

describe('Workers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('follow a yes or no in the Model, and are seen live by name', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(History.make(Timer));
        expect(app.workers('Timer')).toEqual([]);
        app.send('Timer', { _tag: 'Stream' });
        expect(app.workers('Timer')).toEqual([
          { name: 'stream', key: '', status: 'running' },
        ]);
        yield* TestClock.adjust('30 millis');
        expect(app.snapshot().model).toEqual({
          chunks: [1, 2, 3],
          streaming: false,
        });
        expect(app.workers('Timer')).toEqual([]);
        expect(app.history.branch()[1]!.source).toEqual({
          kind: 'worker',
          instance: 'Timer',
          name: 'stream',
        });
      }),
    ));

  it('run one per key, and stop when the key goes', () =>
    timed(
      Effect.gen(function* () {
        heard.length = 0;
        const app = yield* Runtime.start(History.make(Uploads));
        app.send('Uploads', { _tag: 'Started', id: 'a' });
        app.send('Uploads', { _tag: 'Started', id: 'b' });
        expect(app.workers('Uploads').map((w) => w.key)).toEqual(['a', 'b']);
        yield* TestClock.adjust('10 millis');
        app.send('Uploads', { _tag: 'Cancelled', id: 'a' });
        yield* settle;
        expect(heard).toEqual(['closed a']);
        yield* TestClock.adjust('10 millis');
        expect(app.snapshot().model).toEqual({
          uploads: [
            { id: 'a', status: 'Cancelled', progress: 50 },
            { id: 'b', status: 'Done', progress: 100 },
          ],
        });
        expect(heard).toEqual(['closed a', 'closed b']);
        expect(app.workers('Uploads')).toEqual([]);
        expect(app.history.branch().at(-1)!.source).toEqual({
          kind: 'worker',
          instance: 'Uploads',
          name: 'upload',
          key: 'b',
        });
      }),
    ));

  it('a finished Worker stays idle until its key goes, and runs again when it is back', () =>
    run(
      Effect.gen(function* () {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const app = yield* Runtime.start(History.make(Once));
        app.send('Once', { _tag: 'On' });
        yield* settle;
        expect(app.snapshot().model).toEqual({ on: true, runs: 1 });
        expect(app.workers('Once')).toEqual([
          { name: 'once', key: '', status: 'finished' },
        ]);
        app.send('Once', { _tag: 'Off' });
        app.send('Once', { _tag: 'On' });
        yield* settle;
        expect(app.snapshot().model).toEqual({ on: true, runs: 2 });
      }),
    ));

  it('a Worker that dies is logged and seen as failed', () =>
    run(
      Effect.gen(function* () {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        const Broken = Actor.build(Actor.define('Broken', {}), {
          workers: { boom: { run: () => Effect.die(new Error('boom')) } },
        });
        const app = yield* Runtime.start(History.make(Broken));
        yield* settle;
        expect(app.workers('Broken')).toEqual([
          { name: 'boom', key: '', status: 'failed' },
        ]);
        expect(String(errors.mock.calls[0]?.[0])).toContain('boom');
      }),
    ));

  it('read the Time, so a wait until a Time in the Model survives a stop and a fork', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(History.make(Alarm));
        app.send('Alarm', { _tag: 'Set' });
        yield* TestClock.adjust('600 millis');
        yield* app.stop();
        // The Clock runs on while stopped; Time carries on from the Head's.
        yield* TestClock.adjust('5 seconds');
        yield* app.start();
        expect(app.now()).toBe(0);
        yield* TestClock.adjust('999 millis');
        expect(app.history.branch().map((e) => e.message._tag)).toEqual([
          'Set',
        ]);
        yield* TestClock.adjust('1 millis');
        expect(app.history.branch().map((e) => [e.message._tag, e.at])).toEqual(
          [
            ['Set', 0],
            ['Rang', 1000],
          ],
        );
        // A fork from the entry that set it waits the whole second again, from its Time.
        yield* app.start(0);
        yield* TestClock.adjust('1 second');
        expect(app.history.branch().map((e) => [e.message._tag, e.at])).toEqual(
          [
            ['Set', 0],
            ['Rang', 1000],
          ],
        );
        expect(app.history.save().entries.length).toBe(3);
      }),
    ));

  it('a Send from a finalizer dies loudly and never lands', () =>
    run(
      Effect.gen(function* () {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const app = yield* Runtime.start(History.make(Once));
        app.send('Once', { _tag: 'On' });
        yield* settle;
        expect(app.history.branch().map((e) => e.message._tag)).toEqual([
          'On',
          'Ran',
        ]);
        expect(error).toHaveBeenCalledTimes(1);
        expect(error.mock.calls[0]![0]).toMatch(
          /Worker once of Once sent a Message after it stopped/,
        );
      }),
    ));

  it('run while their State lasts, and their Scope closes when it is left', () =>
    timed(
      Effect.gen(function* () {
        heard.length = 0;
        const app = yield* Runtime.start(History.make(Metronome));
        yield* TestClock.adjust('250 millis');
        app.send('Metronome', { _tag: 'Rest' });
        yield* settle;
        yield* TestClock.adjust('1 second');
        expect(heard).toEqual(['beat', 'beat', 'rested']);
        expect(app.snapshot().model).toEqual({ beats: 2 });
      }),
    ));
});
