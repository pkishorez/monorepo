import { Effect, Layer, Schema } from 'effect';
import { TestClock } from 'effect/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Actor, Command, Runtime } from '../index.ts';
import { SignIn, started, settle, timed } from './fixtures.ts';

/* The Work report: what the running app is doing, read from the Runtime alone. */

/** Workers that wait for what their parent Provides, then run forever, finish, or fail. */
const Below = Actor.define('Below', { requires: [SignIn] }).build({
  workers: {
    forever: { run: () => Effect.never },
    once: { run: () => Effect.void },
    boom: { run: () => Effect.die(new Error('boom')) },
  },
});

/** Provides SignIn once a second has passed, and holds Below. */
const Slow = Actor.define('Slow', {}).build({
  provides: {
    capabilities: [SignIn],
    layer: () =>
      Layer.effect(
        SignIn,
        Effect.as(Effect.sleep('1 second'), { complete: () => Effect.void }),
      ),
  },
  children: { below: Actor.child(Below) },
});

/** Provides a SignIn that cannot be built. */
const Broken = Actor.define('Broken', {}).build({
  provides: {
    capabilities: [SignIn],
    layer: () => Layer.effect(SignIn, Effect.die(new Error('no sign in'))),
  },
  children: { below: Actor.child(Below) },
});

/** Holds a Child whose Worker fails, until it is closed. */
const Crash = Actor.define('Crash', {}).build({
  workers: { boom: { run: () => Effect.die(new Error('crashed')) } },
});

const Holder = Actor.define('Holder', {
  state: { Open: {}, Closed: {} },
  message: { Close: {} },
}).build({
  init: () => ({ state: { _tag: 'Open' } }),
  states: {
    Open: {
      children: { crash: Actor.child(Crash) },
      on: { Close: () => ({ state: { _tag: 'Closed' } }) },
    },
    Closed: {},
  },
});

const fetch = Command.make('fetch', {
  args: Schema.Struct({ id: Schema.String }),
  run: ({ id }) =>
    Effect.as(Effect.sleep('1 second'), { _tag: 'Fetched' as const, id }),
});

const explode = Command.make('explode', {
  run: () => Effect.die(new Error('exploded')),
});

const Fetcher = Actor.define('Fetcher', {
  model: { fetched: Schema.Array(Schema.String) },
  message: {
    Fetch: { id: Schema.String },
    Fetched: { id: Schema.String },
    Explode: {},
  },
}).build({
  init: () => ({ model: { fetched: [] } }),
  on: {
    Fetch: ({ id }) => ({ command: fetch({ id }) }),
    Fetched: ({ id }, { model }) => ({
      model: { fetched: [...model.fetched, id] },
    }),
    Explode: () => ({ command: explode() }),
  },
});

describe('The Work report', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('says each Worker is waiting for the Capabilities above it, then running, finished or failed', () =>
    timed(
      Effect.gen(function* () {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const app = yield* Runtime.scoped(Slow);
        yield* settle;
        const waiting = app.work();
        expect(waiting.instances['Slow']).toEqual({
          workers: [],
          commands: [],
          provides: [{ status: 'building' }],
        });
        expect(waiting.instances['Slow/below#1']!.workers).toEqual([
          { name: 'forever', key: '', status: 'waiting', since: 0 },
          { name: 'once', key: '', status: 'waiting', since: 0 },
          { name: 'boom', key: '', status: 'waiting', since: 0 },
        ]);
        expect(waiting.settled).toBe(false);

        yield* TestClock.adjust('1 second');
        yield* settle;
        const after = app.work();
        expect(after.instances['Slow']!.provides).toEqual([
          { status: 'built' },
        ]);
        const [forever, once, boom] = after.instances['Slow/below#1']!.workers;
        expect(forever).toEqual({
          name: 'forever',
          key: '',
          status: 'running',
          since: 1000,
        });
        expect(once).toEqual({
          name: 'once',
          key: '',
          status: 'finished',
          since: 1000,
        });
        expect(boom).toMatchObject({
          name: 'boom',
          status: 'failed',
          since: 1000,
        });
        expect(boom!.failure).toContain('Error: boom');
        expect(after.failures).toMatchObject([
          { address: 'Slow/below#1', kind: 'worker', name: 'boom', at: 1000 },
        ]);
        expect(after.layer).toEqual({ status: 'built' });
        expect(after.settled).toBe(true);
        // The Instance reads the same Workers.
        expect(app.at(app.root.children.below.address)?.workers).toEqual(
          after.instances['Slow/below#1']!.workers,
        );
      }),
    ));

  it('keeps a failure after the Instance it came from stops', () =>
    timed(
      Effect.gen(function* () {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const app = yield* Runtime.scoped(Holder);
        yield* settle;
        expect(
          app.work().instances['Holder/Open:crash#1']!.workers,
        ).toMatchObject([{ name: 'boom', status: 'failed' }]);
        app.root.send({ _tag: 'Close' });
        yield* settle;
        const work = app.work();
        expect(Object.keys(work.instances)).toEqual(['Holder']);
        expect(work.failures).toHaveLength(1);
        expect(work.failures[0]).toMatchObject({
          address: 'Holder/Open:crash#1',
          kind: 'worker',
          name: 'boom',
        });
        expect(work.failures[0]!.failure).toContain('crashed');
      }),
    ));

  it('holds each Command from the moment it is asked for until it ends', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Fetcher);
        yield* TestClock.adjust('100 millis');
        expect(app.work().settled).toBe(true);
        app.root.send({ _tag: 'Fetch', id: 'a' });
        const running = app.work();
        expect(running.instances['Fetcher']!.commands).toEqual([
          { name: 'fetch', args: { id: 'a' }, since: 100 },
        ]);
        expect(running.settled).toBe(false);

        yield* TestClock.adjust('1 second');
        yield* settle;
        expect(app.snapshot.root.model).toEqual({ fetched: ['a'] });
        const done = app.work();
        expect(done.instances['Fetcher']!.commands).toEqual([]);
        expect(done.settled).toBe(true);
      }),
    ));

  it('keeps a Command’s failure', () =>
    timed(
      Effect.gen(function* () {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        const app = yield* Runtime.scoped(Fetcher);
        app.root.send({ _tag: 'Explode' });
        yield* settle;
        const work = app.work();
        expect(work.instances['Fetcher']!.commands).toEqual([]);
        expect(work.failures).toMatchObject([
          { address: 'Fetcher', kind: 'command', name: 'explode', at: 0 },
        ]);
        expect(work.failures[0]!.failure).toContain('exploded');
        // Still on the console.
        expect(String(errors.mock.calls[0]?.[0])).toContain('exploded');
      }),
    ));

  it('says a Provide that cannot be built failed, and what waits below it is not settled', () =>
    timed(
      Effect.gen(function* () {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const app = yield* Runtime.scoped(Broken);
        yield* settle;
        const work = app.work();
        const [provides] = work.instances['Broken']!.provides;
        expect(provides).toMatchObject({ status: 'failed' });
        expect(provides!.failure).toContain('no sign in');
        expect(work.failures).toMatchObject([
          { address: 'Broken', kind: 'provides', name: '' },
        ]);
        expect(
          work.instances['Broken/below#1']!.workers.map(({ status }) => status),
        ).toEqual(['waiting', 'waiting', 'waiting']);
        expect(work.settled).toBe(false);
      }),
    ));

  it('names the State a Provide is written in', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* started;
        yield* settle;
        expect(app.work().instances['Auth']!.provides).toEqual([
          { state: 'Anonymous', status: 'built' },
        ]);
      }),
    ));

  it('has no Instance while the Runtime is stopped, and keeps its failures', () =>
    timed(
      Effect.gen(function* () {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const app = yield* Runtime.scoped(Holder);
        yield* settle;
        yield* Effect.promise(() => app.stop());
        const work = app.work();
        expect(work.instances).toEqual({});
        expect(work.failures).toHaveLength(1);
        expect(work.settled).toBe(true);
      }),
    ));
});
