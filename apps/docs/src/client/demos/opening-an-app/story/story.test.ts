import { Effect } from 'effect';
import type { Scope } from 'effect';
import { TestClock } from 'effect/testing';
import { Address, History, Runtime, Snapshot } from '@kestack/kabuki';
import type { Runtime as Running } from '@kestack/kabuki';
import { describe, expect, it } from 'vitest';
import { AppLive, DURATION } from './index.ts';

const timed = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(Effect.provide(TestClock.layer())),
  );

/** An Address written out, checked against the app's Blueprint. */
const to = (text: string) => Address.check(AppLive, text)!;

const at = (app: Running, address: string) =>
  Snapshot.at(app.snapshot, to(address));

const workers = (app: Running, address: string) =>
  (app.at(to(address))?.workers ?? []).map((worker) => worker.name);

/** Send a Message to the Instance at an Address, from outside the tree. */
const send = (app: Running, address: string, message: { _tag: string }) =>
  app.at(to(address))?.send(message);

/** The History kept beside each Runtime `opened` made. */
const kept = new WeakMap<Running, { history: History }>();

/**
 * The app, with a History kept beside it: made stopped and started once
 * it is followed, so no entry is missed.
 */
const opened = Effect.gen(function* () {
  const app = yield* Runtime.scoped(AppLive, { running: false });
  const beside = { history: History.init(app.snapshot) };
  kept.set(app, beside);
  app.subscribe((entries) => {
    beside.history = History.add(beside.history, entries);
  });
  void app.start();
  return app;
});

/** Every entry the app played, in order. */
const played = (app: Running) => History.entries(kept.get(app)!.history);

/** Every Message's tag, in order. */
const tags = (app: Running) => played(app).map((entry) => entry.message._tag);

const signedIn = Effect.gen(function* () {
  const app = yield* opened;
  send(app, 'App', { _tag: 'Succeed' });
  send(app, 'App', { _tag: 'SignIn' });
  yield* TestClock.adjust('1200 millis');
  return app;
});

describe('Opening an app', () => {
  it('Booting loads each asset with a Worker, then signs out on its own', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* opened;
        expect(workers(app, 'App')).toEqual(['load assets']);
        yield* TestClock.adjust('4800 millis');
        expect(tags(app)).toEqual([
          'AssetLoaded',
          'AssetLoaded',
          'AssetLoaded',
        ]);
        expect(app.snapshot.root.state).toEqual({
          _tag: 'SignedOut',
          signingIn: false,
        });
        expect(workers(app, 'App')).toEqual([]);
      }),
    ));

  it('Fail leaves Booting, which stops the Worker; Retry starts it from nothing', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* opened;
        yield* TestClock.adjust('1600 millis');
        send(app, 'App', { _tag: 'Fail' });
        expect(workers(app, 'App')).toEqual([]);
        yield* TestClock.adjust('5 seconds');
        expect(tags(app)).toEqual(['AssetLoaded', 'Fail']);

        send(app, 'App', { _tag: 'Retry' });
        expect(app.snapshot.root.model).toEqual({ attempts: 2 });
        expect(app.snapshot.root.state).toEqual({
          _tag: 'Booting',
          loaded: [],
        });
        expect(workers(app, 'App')).toEqual(['load assets']);
      }),
    ));

  it('Sign in is a Command: one errand, one Message back, and Inside Invokes Home and Downloads', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* signedIn;
        expect(app.snapshot.root.state).toEqual({
          _tag: 'Inside',
          name: 'Ada',
        });
        expect(played(app).at(-1)!.from).toEqual({
          kind: 'command',
          instance: 'App',
          name: 'sign in',
        });
        expect(at(app, 'App/Inside:home#1')?.props).toEqual({ name: 'Ada' });
        expect(workers(app, 'App/Inside:home#1')).toEqual(['heartbeat']);
      }),
    ));

  it('sync runs while the Model says so', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* signedIn;
        send(app, 'App/Inside:home#1', { _tag: 'ToggleSync' });
        expect(workers(app, 'App/Inside:home#1')).toEqual([
          'heartbeat',
          'sync',
        ]);
        yield* TestClock.adjust('4 seconds');
        send(app, 'App/Inside:home#1', { _tag: 'ToggleSync' });
        expect(workers(app, 'App/Inside:home#1')).toEqual(['heartbeat']);
        expect(at(app, 'App/Inside:home#1')?.model).toMatchObject({
          synced: 2,
        });
      }),
    ));

  it('each file is a keyed Download whose Worker runs while it is Downloading and not paused', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* signedIn;
        const downloads = 'App/Inside:downloads#1';
        send(app, downloads, { _tag: 'Add' });
        send(app, downloads, { _tag: 'Add' });
        const first = `${downloads}/files[1]#1`;
        const second = `${downloads}/files[2]#1`;
        expect(workers(app, first)).toEqual(['download']);

        yield* TestClock.adjust('2 seconds');
        send(app, first, { _tag: 'Pause' });
        yield* Effect.yieldNow;
        expect(at(app, first)?.props).toEqual({ paused: true });
        expect(workers(app, first)).toEqual([]);
        expect(at(app, first)?.model).toMatchObject({ done: 2000 });

        yield* TestClock.adjust(`${DURATION} millis`);
        expect(at(app, second)?.state).toEqual({ _tag: 'Done' });
        expect(at(app, first)?.state).toEqual({ _tag: 'Downloading' });

        send(app, first, { _tag: 'Resume' });
        yield* Effect.yieldNow;
        yield* TestClock.adjust(`${DURATION - 2000} millis`);
        expect(at(app, first)?.state).toEqual({ _tag: 'Done' });
      }),
    ));

  it('Pause all and Resume all change only the list’s data, and every Download follows its Props', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* signedIn;
        const downloads = 'App/Inside:downloads#1';
        send(app, downloads, { _tag: 'Add' });
        send(app, downloads, { _tag: 'Add' });
        const first = `${downloads}/files[1]#1`;
        const second = `${downloads}/files[2]#1`;

        send(app, downloads, { _tag: 'PauseAll' });
        expect(workers(app, first)).toEqual([]);
        expect(workers(app, second)).toEqual([]);

        send(app, downloads, { _tag: 'ResumeAll' });
        expect(workers(app, first)).toEqual(['download']);
        expect(workers(app, second)).toEqual(['download']);
        expect(tags(app).slice(-2)).toEqual(['PauseAll', 'ResumeAll']);
      }),
    ));

  it('Cancel all empties the list, and every Download stops', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* signedIn;
        const downloads = 'App/Inside:downloads#1';
        send(app, downloads, { _tag: 'Add' });
        send(app, downloads, { _tag: 'Add' });
        send(app, downloads, { _tag: 'CancelAll' });
        expect(at(app, downloads)?.model).toMatchObject({ files: [] });
        expect(at(app, `${downloads}/files[1]#1`)).toBeUndefined();
        expect(at(app, `${downloads}/files[2]#1`)).toBeUndefined();
      }),
    ));

  it('Cancel asks Downloads, through what it Provides, to take the key away', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* signedIn;
        const downloads = 'App/Inside:downloads#1';
        send(app, downloads, { _tag: 'Add' });
        send(app, `${downloads}/files[1]#1`, { _tag: 'Cancel' });
        yield* Effect.yieldNow;
        expect(at(app, downloads)?.model).toMatchObject({ files: [] });
        expect(at(app, `${downloads}/files[1]#1`)).toBeUndefined();
      }),
    ));

  it('Sign out is a Request up to App, two seconds on: leaving Inside stops everything below it', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* signedIn;
        send(app, 'App/Inside:downloads#1', { _tag: 'Add' });
        send(app, 'App/Inside:home#1', { _tag: 'SignOut' });
        expect(at(app, 'App/Inside:home#1')?.model).toMatchObject({
          signingOut: true,
        });
        yield* TestClock.adjust('2 seconds');
        expect(app.snapshot.root.state).toEqual({
          _tag: 'SignedOut',
          signingIn: false,
        });
        expect(at(app, 'App/Inside:home#1')).toBeUndefined();
        expect(workers(app, 'App/Inside:downloads#1/files[1]#1')).toEqual([]);
      }),
    ));
});
