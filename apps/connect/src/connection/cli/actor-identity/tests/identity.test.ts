import { connect, createServer } from 'node:net';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { socketPath } from '@kestack/cli-platform/files';
import { reach } from '@kestack/cli-platform/single';
import { addressOf } from '../../../../contract/index.js';
import { ConnectionControl } from '../services/index.js';
import {
  eventually,
  fake,
  release,
  reportedFrom,
  runToEnd,
  start,
} from './fixtures/identity.js';

/*
 * Connect is tied to the User's login: the Connection, and everything under
 * it, runs only while signed in, against a fake account on Connect Cloud.
 */

/** Whether something listens on `socket` now. */
const listening = (socket: string) =>
  new Promise<boolean>((resolve) => {
    const probe = connect({ path: socket });
    probe.once('connect', () => {
      probe.destroy();
      resolve(true);
    });
    probe.once('error', () => resolve(false));
  });

/** Waits until something listens on `socket`, or nothing does. */
const until = async (socket: string, up: boolean) => {
  for (let tries = 0; tries < 400; tries++) {
    if ((await listening(socket)) === up) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${socket} is ${up ? 'not' : 'still'} listened on`);
};

describe('signing in', () => {
  it('runs nothing until signed in', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const host = fake({ identify: Effect.never });
          const { now } = yield* start(host);
          yield* Effect.sleep('100 millis');
          expect(now().state._tag).toBe('SigningIn');
          expect(host.opened).toEqual([]);
          expect(host.reports).toEqual([]);
        }),
      ),
    ));

  it('stops, saying why, when the first Sign-in fails', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const host = fake({ identify: Effect.fail('no such Cloud') });
        expect(yield* runToEnd(host)).toEqual({
          _tag: 'Stopped',
          reason: 'no such Cloud',
        });
      }),
    ));
});

describe('a Sign-in that dies', () => {
  it('stops, saying why, rather than hanging while it holds its name', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const host = fake({ identify: Effect.die(new Error('disk full')) });
        expect(yield* runToEnd(host)).toEqual({
          _tag: 'Stopped',
          reason: 'disk full',
        });
      }),
    ));
});

describe('a port that cannot be opened', () => {
  it('ends it Stopped, saying why', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const taken = createServer();
          yield* Effect.acquireRelease(
            Effect.promise(
              () =>
                new Promise<void>((resolve) =>
                  taken.listen(0, '127.0.0.1', resolve),
                ),
            ),
            () => Effect.sync(() => void taken.close()),
          );
          const address = taken.address();
          if (address === null || typeof address === 'string')
            return expect.fail('no port');
          const host = fake({});
          const { ended, now } = yield* start(host, address.port);
          const why = yield* ended;
          expect(why).toEqual({
            _tag: 'Stopped',
            reason: expect.stringContaining(
              `Could not listen on 127.0.0.1:${address.port}`,
            ),
          });
          expect(now().state).toEqual({ _tag: 'Ended', why });
          expect(host.opened).toEqual([]);
        }),
      ),
    ));
});

describe('its control socket', () => {
  it('says no id and no address before signing in, and stopping ends it', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const host = fake({ identify: Effect.never });
          const { ended, input } = yield* start(host);
          const control = yield* reach(input.control, ConnectionControl);
          // Until Identity answers, the socket stops the program, not the tree.
          yield* Effect.sleep('50 millis');
          expect(yield* control.status()).toEqual({
            name: 'test',
            id: '',
            url: null,
          });
          yield* Effect.forkScoped(control.stop());
          expect(yield* ended).toEqual({ _tag: 'Stopped', reason: null });
        }),
      ),
    ));

  it('says the id once signed in, and the address once Reported', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const host = fake({});
          const { ended, input } = yield* start(host);
          const control = yield* reach(input.control, ConnectionControl);
          yield* Effect.promise(() =>
            vi.waitFor(
              async () =>
                expect(await Effect.runPromise(control.status())).toEqual({
                  name: 'test',
                  id: 'connection-1',
                  url: 'https://t1.example',
                }),
              { timeout: 5_000, interval: 20 },
            ),
          );
          yield* Effect.forkScoped(control.stop());
          expect(yield* ended).toEqual({ _tag: 'Stopped', reason: null });
        }),
      ),
    ));

  it('stops saying an address once signed out', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          let loggedOut = false;
          const host = fake({
            answer: () =>
              loggedOut
                ? { _tag: 'SignedOut' }
                : { _tag: 'Reported', wanted: {} },
            signInAgain: Effect.never,
          });
          const { now, input } = yield* start(host);
          const control = yield* reach(input.control, ConnectionControl);
          yield* eventually(() =>
            expect(now().model.url).toBe('https://t1.example'),
          );
          loggedOut = true;
          yield* eventually(() => expect(now().state._tag).toBe('SigningIn'));
          expect(yield* control.status()).toEqual({
            name: 'test',
            id: '',
            url: null,
          });
        }),
      ),
    ));
});

describe('a Report', () => {
  it('carries the Connection’s key, a new one for each sign-in', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          let loggedOut = false;
          const host = fake({
            answer: (status) => {
              if (reportedFrom(status, 1) && !loggedOut) {
                loggedOut = true;
                return { _tag: 'SignedOut' };
              }
              return { _tag: 'Reported', wanted: {} };
            },
          });
          yield* start(host);
          yield* eventually(() =>
            expect(host.reports.some((status) => reportedFrom(status, 2))).toBe(
              true,
            ),
          );
          expect(new Set(host.keys).size).toBe(2);
        }),
      ),
    ));
});

describe('a Report’s answer', () => {
  it('ends it Forgotten when Connect Cloud forgot the Connection, closing the tunnel', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const host = fake({
          answer: (_, count) =>
            count >= 3
              ? { _tag: 'Forgotten' }
              : { _tag: 'Reported', wanted: {} },
        });
        expect(yield* runToEnd(host)).toEqual({ _tag: 'Forgotten' });
        yield* eventually(() =>
          expect(host.closed).toEqual(['https://t1.example']),
        );
      }),
    ));

  it('stops when Connect Cloud refuses the Connection', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const host = fake({
          answer: () => ({ _tag: 'Refused', reason: 'taken' }),
        });
        expect(yield* runToEnd(host)).toEqual({
          _tag: 'Stopped',
          reason: 'taken',
        });
      }),
    ));

  it('reports once when Outdated, then stops, saying how to update', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const host = fake({
          answer: () => ({
            _tag: 'Outdated',
            version: '0.0.3',
            minConnect: '0.0.4',
          }),
        });
        expect(yield* runToEnd(host)).toEqual({
          _tag: 'Stopped',
          reason:
            'ke-connect 0.0.3 is older than Connect Cloud accepts (0.0.4): run `npm i -g @kestack/connect@latest`, then serve again.',
        });
        expect(host.reports.length).toBeGreaterThan(0);
      }),
    ));

  it('keeps everything running while a Report cannot be sent', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const host = fake({
            answer: () => ({ _tag: 'Unsent', problem: 'offline' }),
          });
          const { now } = yield* start(host);
          yield* eventually(() =>
            expect(host.reports.length).toBeGreaterThan(10),
          );
          expect(now().state._tag).toBe('SignedIn');
          expect(host.signIns()).toBe(0);
          expect(host.opened).toEqual(['https://t1.example']);
          expect(host.closed).toEqual([]);
        }),
      ),
    ));
});

describe('logging out', () => {
  it(
    'removes the Connection, its tunnel and its Plugins, until signed in again',
    () =>
      Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const ping = release();
            let loggedOut = false;
            const host = fake({
              answer: () =>
                loggedOut
                  ? { _tag: 'SignedOut' }
                  : { _tag: 'Reported', wanted: { ping } },
              signInAgain: Effect.never,
            });
            const { now, input } = yield* start(host);
            const socket = socketPath(
              input.folders.runtime,
              input.socketId,
              'ping',
            );
            yield* Effect.promise(() => until(socket, true));

            loggedOut = true;
            yield* eventually(() => expect(now().state._tag).toBe('SigningIn'));
            // Nothing runs, and it waits for a new Sign-in.
            yield* eventually(() =>
              expect(host.closed).toContain('https://t1.example'),
            );
            yield* Effect.promise(() => until(socket, false));
            expect(now().children).toEqual({});
          }),
        ),
      ),
    40_000,
  );

  it('opens a new tunnel once signed in again', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          let loggedOut = false;
          const host = fake({
            answer: (status) => {
              if (reportedFrom(status, 1) && !loggedOut) {
                loggedOut = true;
                return { _tag: 'SignedOut' };
              }
              return { _tag: 'Reported', wanted: {} };
            },
          });
          yield* start(host);
          yield* eventually(() =>
            expect(host.reports.some((status) => reportedFrom(status, 2))).toBe(
              true,
            ),
          );
          expect(host.signIns()).toBe(1);
          expect(host.closed).toContain('https://t1.example');
        }),
      ),
    ));

  it('stops when signing in again fails', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const host = fake({
          answer: () => ({ _tag: 'SignedOut' }),
          signInAgain: Effect.fail('someone else'),
        });
        expect(yield* runToEnd(host)).toEqual({
          _tag: 'Stopped',
          reason: 'someone else',
        });
      }),
    ));

  it('backs off, longer each time, while Connect Cloud refuses every new Sign-in', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const host = fake({
            answer: () => ({ _tag: 'SignedOut' }),
            backoff: '20 millis',
          });
          yield* start(host);
          // Waits of 0, 20, 40, 80 and 160 ms: five Sign-ins by 300 ms.
          yield* eventually(() => expect(host.signedInAt.length).toBe(5));
          yield* Effect.sleep('100 millis');
          expect(host.signedInAt.length).toBe(5);
          const gaps = host.signedInAt
            .slice(1)
            .map((at, i) => at - host.signedInAt[i]!);
          expect(gaps[3]!).toBeGreaterThanOrEqual(160);
          expect(gaps[3]!).toBeGreaterThan(gaps[1]! * 2);
        }),
      ),
    ));

  it('signs in again at once after a Report was taken since the last refusal', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          let refusals = 0;
          let taken = false;
          const host = fake({
            answer: (status) => {
              if (refusals === 0 || (taken && refusals === 1)) {
                refusals++;
                return { _tag: 'SignedOut' };
              }
              // Taken once the tunnel opened after signing in again.
              if (addressOf(status) !== null) taken = true;
              return { _tag: 'Reported', wanted: {} };
            },
            backoff: '1 minute',
          });
          yield* start(host);
          yield* eventually(() => expect(host.signIns()).toBe(2));
        }),
      ),
    ));
});
