import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { SignInFailed } from '../../services/sign-in/contract/index.js';
import {
  ADA,
  eventually,
  hash,
  release,
  start,
  world,
} from './fixtures/world.js';

const run = <A, E>(effect: Effect.Effect<A, E, import('effect').Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

const enabled = (plugins: Record<string, ReturnType<typeof release>>) => () =>
  ({ _tag: 'Enabled', plugins }) as const;

describe('signing in', () => {
  it('signs in with a device code the first time, then runs the Tunnel', () =>
    run(
      Effect.gen(function* () {
        const host = world();
        const { now } = yield* start(host);
        yield* eventually(() => expect(now().state._tag).toBe('SignedIn'));
        expect(host.events.slice(0, 2)).toEqual(['saved', 'signIn']);
        yield* eventually(() =>
          expect(host.events).toContain('open https://t1.trycloudflare.com'),
        );
      }),
    ));

  it('uses the saved Sign-in without asking again', () =>
    run(
      Effect.gen(function* () {
        const host = world({ saved: ADA });
        const { now } = yield* start(host);
        yield* eventually(() => expect(now().state._tag).toBe('SignedIn'));
        expect(host.events).not.toContain('signIn');
      }),
    ));

  it('stops, saying why, when signing in fails', () =>
    run(
      Effect.gen(function* () {
        const host = world({
          signIn: Effect.fail(new SignInFailed({ message: 'cancelled' })),
        });
        const { stopped } = yield* start(host);
        expect(yield* stopped).toEqual({ _tag: 'Failed', reason: 'cancelled' });
        expect(host.events).not.toContain('listen');
      }),
    ));
});

describe('the Heartbeat', () => {
  it('reports the key as soon as the port opens, and the address once the tunnel is up', () =>
    run(
      Effect.gen(function* () {
        const host = world({ saved: ADA });
        yield* start(host);
        yield* eventually(() =>
          expect(
            host.reports.some(
              (report) => report.url === 'https://t1.trycloudflare.com',
            ),
          ).toBe(true),
        );
        const first = host.reports[0]!;
        expect(first).toMatchObject({
          id: 'connection-1',
          name: 'Ada-MacBook',
          version: '1.0.0',
        });
        expect(first.key.length).toBeGreaterThan(20);
      }),
    ));

  it('keeps reporting every heartbeatEvery', () =>
    run(
      Effect.gen(function* () {
        const host = world({ saved: ADA });
        yield* start(host);
        yield* eventually(() => expect(host.reports.length).toBeGreaterThan(5));
      }),
    ));

  it('runs the Plugins Connect Cloud enables, and nothing before it answers', () =>
    run(
      Effect.gen(function* () {
        const host = world({
          saved: ADA,
          answer: enabled({ code: release('a') }),
        });
        yield* start(host);
        yield* eventually(() => expect(host.running()).toEqual(['code@a']));
        expect(host.events.indexOf('start code@a')).toBeGreaterThan(
          host.events.indexOf('listen'),
        );
      }),
    ));

  it('swaps a Plugin for its new Release, and stops one no longer enabled', () =>
    run(
      Effect.gen(function* () {
        const host = world({
          saved: ADA,
          answer: enabled({ code: release('a'), notes: release('e') }),
        });
        yield* start(host);
        yield* eventually(() =>
          expect(host.running()).toEqual(['code@a', 'notes@e']),
        );
        host.state.answer = enabled({ code: release('b') });
        yield* eventually(() => expect(host.running()).toEqual(['code@b']));
        expect(host.events).toContain('stop code@a');
        expect(host.events).toContain('stop notes@e');
      }),
    ));

  it('keeps everything running when a Report is not sent', () =>
    run(
      Effect.gen(function* () {
        const host = world({
          saved: ADA,
          answer: (count) =>
            count < 3
              ? { _tag: 'Enabled', plugins: { code: release('a') } }
              : { _tag: 'Unsent', problem: 'offline' },
        });
        const { now } = yield* start(host);
        yield* eventually(() => expect(host.reports.length).toBeGreaterThan(6));
        expect(now().state._tag).toBe('SignedIn');
        expect(host.running()).toEqual(['code@a']);
      }),
    ));

  it('never runs a Plugin named as the control socket, or one whose name is no folder name', () =>
    run(
      Effect.gen(function* () {
        const host = world({
          saved: ADA,
          answer: enabled({
            connect: release('c'),
            '../escape': release('d'),
            Upper: release('e'),
            code: release('a'),
          }),
        });
        yield* start(host);
        yield* eventually(() => expect(host.running()).toEqual(['code@a']));
      }),
    ));

  it('stops the Tunnel and every Plugin when signed out, then signs in again', () =>
    run(
      Effect.gen(function* () {
        let signedOut = false;
        const host = world({
          saved: ADA,
          answer: () =>
            signedOut
              ? { _tag: 'SignedOut' }
              : { _tag: 'Enabled', plugins: { code: release('a') } },
        });
        const { now } = yield* start(host);
        yield* eventually(() => expect(host.running()).toEqual(['code@a']));
        signedOut = true;
        yield* eventually(() => expect(host.events).toContain('signInAgain'));
        expect(host.events).toContain('stop code@a');
        expect(host.events).toContain('unlisten');
        signedOut = false;
        yield* eventually(() => expect(host.running()).toEqual(['code@a']));
        expect(now().state._tag).toBe('SignedIn');
      }),
    ));

  it('refuses to carry on as another User after signing in again', () =>
    run(
      Effect.gen(function* () {
        const host = world({
          saved: ADA,
          signInAgain: Effect.succeed({ id: 'bob', email: 'bob@kestack.test' }),
          answer: () => ({ _tag: 'SignedOut' }),
        });
        const { stopped } = yield* start(host);
        const why = yield* stopped;
        expect(why._tag).toBe('Failed');
        expect(why._tag === 'Failed' && why.reason).toMatch(/bob@kestack.test/);
      }),
    ));

  it('waits longer each time the new Sign-in is refused at once', () =>
    run(
      Effect.gen(function* () {
        const host = world({
          saved: ADA,
          answer: () => ({ _tag: 'SignedOut' }),
        });
        const { now } = yield* start(host);
        yield* eventually(
          () =>
            expect(
              host.events.filter((event) => event === 'signInAgain').length,
            ).toBeGreaterThanOrEqual(3),
          5_000,
        );
        expect(now().model.signIn.refusals).toBeGreaterThanOrEqual(3);
      }),
    ));

  it('stops as Removed when the Connection was removed in the app', () =>
    run(
      Effect.gen(function* () {
        const host = world({ saved: ADA, answer: () => ({ _tag: 'Removed' }) });
        const { stopped } = yield* start(host);
        expect(yield* stopped).toEqual({ _tag: 'Removed' });
      }),
    ));

  it('stops as Outdated, with Connect Cloud’s line', () =>
    run(
      Effect.gen(function* () {
        const host = world({
          saved: ADA,
          answer: () => ({ _tag: 'Outdated', line: 'update ke-connect' }),
        });
        const { stopped } = yield* start(host);
        expect(yield* stopped).toEqual({
          _tag: 'Outdated',
          line: 'update ke-connect',
        });
      }),
    ));
});

describe('the Tunnel', () => {
  it('stops everything when the local port cannot be opened', () =>
    run(
      Effect.gen(function* () {
        const host = world({ saved: ADA, portFails: true });
        const { stopped } = yield* start(host);
        expect(yield* stopped).toEqual({
          _tag: 'Failed',
          reason: 'port 1 is taken',
        });
      }),
    ));

  it(
    'opens the tunnel again after it failed to open',
    () =>
      run(
        Effect.gen(function* () {
          const host = world({ saved: ADA, openFails: 1 });
          const { now } = yield* start(host);
          yield* eventually(
            () =>
              expect(host.events).toContain(
                'open https://t2.trycloudflare.com',
              ),
            8_000,
          );
          const tunnel = now();
          expect(tunnel.state._tag).toBe('SignedIn');
        }),
      ),
    10_000,
  );

  it('starts the tunnel again after three checks in a row cannot reach it', () =>
    run(
      Effect.gen(function* () {
        const host = world({ saved: ADA });
        yield* start(host);
        yield* eventually(() =>
          expect(host.events).toContain('open https://t1.trycloudflare.com'),
        );
        host.state.reachable = false;
        yield* eventually(() =>
          expect(host.events).toContain('close https://t1.trycloudflare.com'),
        );
        host.state.reachable = true;
        yield* eventually(() =>
          expect(host.events).toContain('open https://t2.trycloudflare.com'),
        );
        yield* eventually(() =>
          expect(host.reports.at(-1)?.url).toBe('https://t2.trycloudflare.com'),
        );
      }),
    ));

  it('makes a new key every rotateKeyEvery and reports it at once', () =>
    run(
      Effect.gen(function* () {
        const host = world({ saved: ADA });
        yield* start(host, {
          heartbeatEvery: 60_000,
          tunnel: { rotateKeyEvery: 50 },
        });
        yield* eventually(() =>
          expect(new Set(host.reports.map((r) => r.key)).size).toBeGreaterThan(
            2,
          ),
        );
        const server = host.server()!;
        expect(server.key()).toBe(host.reports.at(-1)!.key);
      }),
    ));

  it('routes a call only to a Plugin enabled at that Release', () =>
    run(
      Effect.gen(function* () {
        const host = world({
          saved: ADA,
          answer: enabled({ code: release('a') }),
        });
        yield* start(host);
        yield* eventually(() => expect(host.running()).toEqual(['code@a']));
        const server = host.server()!;
        yield* eventually(() =>
          expect(server.route('code', hash('a'))).toEqual({
            socket: '/run/k/code.sock',
          }),
        );
        expect(server.route('code', hash('b'))).toEqual({ running: hash('a') });
        expect(server.route('notes', hash('a'))).toBeNull();
      }),
    ));
});

describe('a Plugin', () => {
  it('is started again after it crashes, waiting first', () =>
    run(
      Effect.gen(function* () {
        const host = world({
          saved: ADA,
          answer: enabled({ code: release('a') }),
        });
        const { now } = yield* start(host);
        yield* eventually(() => expect(host.running()).toEqual(['code@a']));
        yield* host.crash('code@a');
        yield* eventually(() =>
          expect(
            host.events.filter((event) => event === 'start code@a').length,
          ).toBe(2),
        );
        const root = now();
        if (root._tag !== 'SignedIn') throw new Error('not signed in');
        yield* eventually(() =>
          expect(
            Object.values(root.children.plugins).map((each) => each.state._tag),
          ).toEqual(['Running']),
        );
      }),
    ));

  it('is Crashed, keeping its last lines, when it cannot start, and tried again', () =>
    run(
      Effect.gen(function* () {
        let fails = true;
        const host = world({
          saved: ADA,
          answer: enabled({ code: release('a') }),
          startFails: () => fails,
        });
        const { now } = yield* start(host);
        yield* eventually(() => {
          const root = now();
          if (root._tag !== 'SignedIn') throw new Error('not signed in');
          const [plugin] = Object.values(root.children.plugins);
          expect(plugin?.state).toMatchObject({
            _tag: 'Crashed',
            log: ['boom'],
          });
        });
        fails = false;
        yield* eventually(() => expect(host.running()).toEqual(['code@a']));
      }),
    ));

  it('waits twice as long after each crash in a row', () =>
    run(
      Effect.gen(function* () {
        const host = world({
          saved: ADA,
          answer: enabled({ code: release('a') }),
          startFails: () => true,
        });
        const { now } = yield* start(host);
        yield* eventually(() => {
          const root = now();
          if (root._tag !== 'SignedIn') throw new Error('not signed in');
          const [plugin] = Object.values(root.children.plugins);
          expect(plugin?.model.crashes).toBeGreaterThanOrEqual(4);
        });
      }),
    ));
});

describe('stopping', () => {
  it('stops when asked on the control socket, letting go of everything', () =>
    run(
      Effect.gen(function* () {
        const host = world({
          saved: ADA,
          answer: enabled({ code: release('a') }),
        });
        const { stopped } = yield* start(host);
        yield* eventually(() => expect(host.running()).toEqual(['code@a']));
        const answers = host.answers()!;
        const status = yield* answers.status;
        expect(status).toMatchObject({ name: 'main', id: 'connection-1' });
        yield* answers.stop;
        expect(yield* stopped).toEqual({ _tag: 'Requested' });
        yield* eventually(() => expect(host.running()).toEqual([]));
        expect(host.events).toContain('unlisten');
      }),
    ));
});
