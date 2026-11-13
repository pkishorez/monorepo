import { Effect } from 'effect';
import { TestClock } from 'effect/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Actor, History, Snapshot } from '../index.ts';
import type { Runtime } from '../index.ts';
import {
  fork,
  line,
  start,
  stop,
  tags,
  settle,
  run,
  timed,
  heard,
  Timer,
  Metronome,
  Uploads,
  Once,
  Alarm,
  historyOf,
  scoped,
  seek,
  send,
} from './fixtures.ts';

/* Workers: work that runs for exactly as long as its Condition holds. */

describe('Workers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('follow a yes or no in the Model, and are seen live by name', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* scoped(Timer);
        expect(app.root.workers).toEqual([]);
        send(app, 'Timer', { _tag: 'Stream' });
        expect(app.root.workers).toEqual([
          { name: 'stream', key: '', status: 'running' },
        ]);
        yield* TestClock.adjust('30 millis');
        expect(app.snapshot.root.model).toEqual({
          chunks: [1, 2, 3],
          streaming: false,
        });
        expect(app.root.workers).toEqual([]);
        expect(line(app)[1]!.from).toEqual({
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
        const app = yield* scoped(Uploads);
        send(app, 'Uploads', { _tag: 'Started', id: 'a' });
        send(app, 'Uploads', { _tag: 'Started', id: 'b' });
        expect(app.root.workers.map((w) => w.key)).toEqual(['a', 'b']);
        yield* TestClock.adjust('10 millis');
        send(app, 'Uploads', { _tag: 'Cancelled', id: 'a' });
        yield* settle;
        expect(heard).toEqual(['closed a']);
        yield* TestClock.adjust('10 millis');
        expect(app.snapshot.root.model).toEqual({
          uploads: [
            { id: 'a', status: 'Cancelled', progress: 50 },
            { id: 'b', status: 'Done', progress: 100 },
          ],
        });
        expect(heard).toEqual(['closed a', 'closed b']);
        expect(app.root.workers).toEqual([]);
        expect(line(app).at(-1)!.from).toEqual({
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
        const app = yield* scoped(Once);
        send(app, 'Once', { _tag: 'On' });
        yield* settle;
        expect(app.snapshot.root.model).toEqual({ on: true, runs: 1 });
        expect(app.root.workers).toEqual([
          { name: 'once', key: '', status: 'finished' },
        ]);
        send(app, 'Once', { _tag: 'Off' });
        send(app, 'Once', { _tag: 'On' });
        yield* settle;
        expect(app.snapshot.root.model).toEqual({ on: true, runs: 2 });
      }),
    ));

  it('a Worker that dies is logged and seen as failed', () =>
    run(
      Effect.gen(function* () {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        const Broken = Actor.define('Broken', {}).build({
          workers: { boom: { run: () => Effect.die(new Error('boom')) } },
        });
        const app = yield* scoped(Broken);
        yield* settle;
        expect(app.root.workers).toEqual([
          { name: 'boom', key: '', status: 'failed' },
        ]);
        expect(String(errors.mock.calls[0]?.[0])).toContain('boom');
      }),
    ));

  it('read the Time, so a wait until a Time in the Model survives a stop and a fork', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* scoped(Alarm);
        app.root.send({ _tag: 'Set' });
        yield* TestClock.adjust('600 millis');
        yield* stop(app);
        yield* TestClock.adjust('300 millis');
        // Time stands still while stopped: started again, it waits only what is left.
        yield* start(app);
        expect(app.now()).toBe(600);
        yield* TestClock.adjust('399 millis');
        expect(tags(app)).toEqual(['Set']);
        yield* TestClock.adjust('1 millis');
        expect(line(app).map((e) => [e.message._tag, e.at])).toEqual([
          ['Set', 0],
          ['Rang', 1000],
        ]);
        // A Fork to the entry that set it waits the whole second again, from its Time.
        yield* fork(app, 0);
        expect(app.now()).toBe(0);
        yield* TestClock.adjust('1 second');
        expect(line(app).map((e) => [e.message._tag, e.at])).toEqual([
          ['Set', 0],
          ['Rang', 1000],
        ]);
        expect(History.children(historyOf(app), 0)).toHaveLength(2);
      }),
    ));

  it('a Send from a finalizer dies loudly and never lands', () =>
    run(
      Effect.gen(function* () {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const app = yield* scoped(Once);
        send(app, 'Once', { _tag: 'On' });
        yield* settle;
        expect(line(app).map((e) => e.message._tag)).toEqual(['On', 'Ran']);
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
        const app = yield* scoped(Metronome);
        yield* TestClock.adjust('250 millis');
        send(app, 'Metronome', { _tag: 'Rest' });
        yield* settle;
        yield* TestClock.adjust('1 second');
        expect(heard).toEqual(['beat', 'beat', 'rested']);
        expect(app.snapshot.root.model).toEqual({ beats: 2 });
      }),
    ));

  it('are asked for by the data alone, as Snapshot.workers reads it, whether the Runtime runs or not', () =>
    timed(
      Effect.gen(function* () {
        const wanted = (app: Runtime<any>) =>
          Snapshot.workers(app.actor, app.snapshot, app.root.address);

        const metronome = yield* scoped(Metronome);
        send(metronome, 'Metronome', { _tag: 'Rest' });
        yield* stop(metronome);
        expect(metronome.root.workers).toEqual([]);
        expect(wanted(metronome)).toEqual([{ name: 'alive' }]);

        const uploads = yield* scoped(Uploads);
        const root = uploads.root.address;
        expect(wanted(uploads)).toEqual([]);
        uploads.root.send({ _tag: 'Started', id: 'a' });
        uploads.root.send({ _tag: 'Started', id: 'b' });
        uploads.root.send({ _tag: 'Cancelled', id: 'a' });
        expect(wanted(uploads)).toEqual([{ name: 'upload', key: 'b' }]);
        // The ones the running Runtime runs there.
        expect(
          uploads.root.workers.map(({ name, key }) => ({ name, key })),
        ).toEqual(wanted(uploads));

        const before = seek(uploads, line(uploads)[1]!.id);
        expect(Snapshot.workers(Uploads, before, root)).toEqual([
          { name: 'upload', key: 'a' },
          { name: 'upload', key: 'b' },
        ]);
        expect(
          Snapshot.workers(Uploads, before, 'Uploads/gone#1' as typeof root),
        ).toEqual([]);
      }),
    ));
});
