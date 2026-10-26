import { type Duration, Effect, Fiber } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import {
  addressOf,
  type ConnectionStatus,
} from '../../../../cloud/contract/index.js';
import { heartbeat } from '../heartbeat.js';

/*
 * The Heartbeat against a fake tunnel, whose addresses are numbered by how
 * many times one was opened, and a fake Cloud Connect that records each Report.
 */

type Report = ConnectionStatus;
type Answer = Parameters<typeof heartbeat>[0]['report'] extends (
  ...args: never
) => Effect.Effect<infer A>
  ? A
  : never;

const fake = (options: {
  readonly healthy: (url: string) => boolean;
  readonly answer?: (report: Report, count: number) => Answer;
  readonly signInAgain?: Effect.Effect<void, string>;
  readonly backoff?: Duration.Input;
  /** Whether cloudflared is there at first; the fake download installs it. */
  readonly installed?: boolean;
  readonly install?: Effect.Effect<void, Error>;
}) => {
  let installed = options.installed ?? true;
  const opened: Array<string> = [];
  const closed: Array<string> = [];
  const reports: Array<Report> = [];
  const signIns: Array<number> = [];
  const host = {
    every: '10 millis',
    installed: Effect.sync(() => installed),
    install: Effect.andThen(
      options.install ?? Effect.void,
      Effect.sync(() => void (installed = true)),
    ),
    open: Effect.acquireRelease(
      Effect.sync(() => {
        const url = `https://t${opened.length + 1}.example`;
        opened.push(url);
        return { url, closed: Effect.never };
      }),
      ({ url }) => Effect.sync(() => void closed.push(url)),
    ),
    check: (url: string) =>
      Effect.succeed({
        ok: options.healthy(url),
        at: Date.now(),
        problem: options.healthy(url) ? null : 'down',
      }),
    report: (report: Report) =>
      Effect.sync(() => {
        reports.push(report);
        return (
          options.answer?.(report, reports.length) ?? {
            _tag: 'Reported' as const,
          }
        );
      }),
    backoff: options.backoff ?? '10 millis',
    signInAgain: Effect.suspend(() => {
      signIns.push(Date.now());
      return options.signInAgain ?? Effect.void;
    }),
  } satisfies Parameters<typeof heartbeat>[0];
  return {
    host,
    opened,
    closed,
    reports,
    signIns: () => signIns.length,
    signedInAt: signIns,
  };
};

const eventually = (assertion: () => void) =>
  Effect.promise(() => vi.waitFor(assertion, { timeout: 5_000, interval: 10 }));

describe('the Heartbeat', () => {
  it('reports cloudflared downloading, then the tunnel opening, then up', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { host, reports } = fake({
            healthy: () => true,
            installed: false,
            install: Effect.sleep('30 millis'),
          });
          const running = yield* Effect.forkScoped(heartbeat(host));
          yield* eventually(() =>
            expect(reports.at(-1)?._tag).toBe('Reachable'),
          );
          // Opening at first, until the tunnel finds cloudflared missing.
          const tags = reports.map(({ _tag }) => _tag).join(',');
          expect(tags).toMatch(/Installing,(Installing,)*Opening,.*Reachable$/);
          yield* Fiber.interrupt(running);
        }),
      ),
    ));

  it('reports why the tunnel could not open', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { host, reports } = fake({
            healthy: () => true,
            installed: false,
            install: Effect.fail(new Error('download timed out')),
          });
          const running = yield* Effect.forkScoped(heartbeat(host));
          yield* eventually(() =>
            expect(reports).toContainEqual(
              expect.objectContaining({
                _tag: 'OpenFailed',
                problem: 'download timed out',
              }),
            ),
          );
          yield* Fiber.interrupt(running);
        }),
      ),
    ));

  it('restarts the tunnel after three failed checks in a row, and reports the new address', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { host, opened, closed, reports } = fake({
            healthy: (url) => url !== 'https://t1.example',
          });
          const running = yield* Effect.forkScoped(heartbeat(host));
          yield* eventually(() =>
            expect(
              reports.some(
                (report) => addressOf(report) === 'https://t2.example',
              ),
            ).toBe(true),
          );
          expect(opened).toEqual(['https://t1.example', 'https://t2.example']);
          expect(closed).toEqual(['https://t1.example']);
          // Reports of the first tunnel carried one, then two failed checks.
          const failures = reports.filter(
            (report) =>
              report._tag === 'Unreachable' &&
              report.url === 'https://t1.example',
          );
          expect(failures.length).toBe(2);
          yield* eventually(() =>
            expect(
              reports.some(
                (report) =>
                  report._tag === 'Reachable' &&
                  report.url === 'https://t2.example',
              ),
            ).toBe(true),
          );
          expect(opened).toHaveLength(2);
          yield* Fiber.interrupt(running);
        }),
      ),
    ));

  it('keeps the tunnel while checks fail fewer than three times in a row', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          let checks = 0;
          const { host, opened, reports } = fake({
            // Fails every other check.
            healthy: () => checks++ % 2 === 0,
          });
          const running = yield* Effect.forkScoped(heartbeat(host));
          yield* eventually(() => expect(reports.length).toBeGreaterThan(10));
          expect(opened).toEqual(['https://t1.example']);
          yield* Fiber.interrupt(running);
        }),
      ),
    ));

  it('ends Forgotten when Cloud Connect forgot the Connection, closing the tunnel', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { host, closed } = fake({
            healthy: () => true,
            answer: (_, count) =>
              count >= 3 ? { _tag: 'Forgotten' } : { _tag: 'Reported' },
          });
          expect(yield* heartbeat(host)).toEqual({ _tag: 'Forgotten' });
          yield* eventually(() =>
            expect(closed).toEqual(['https://t1.example']),
          );
        }),
      ),
    ));

  it('closes the tunnel when signed out, and opens a new one once signed in again', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          let signedOut = false;
          const { host, opened, closed, reports, signIns } = fake({
            healthy: () => true,
            answer: (report) => {
              if (addressOf(report) === 'https://t1.example' && !signedOut) {
                signedOut = true;
                return { _tag: 'SignedOut' };
              }
              return { _tag: 'Reported' };
            },
          });
          const running = yield* Effect.forkScoped(heartbeat(host));
          yield* eventually(() =>
            expect(
              reports.some(
                (report) => addressOf(report) === 'https://t2.example',
              ),
            ).toBe(true),
          );
          expect(signIns()).toBe(1);
          expect(opened).toEqual(['https://t1.example', 'https://t2.example']);
          expect(closed).toContain('https://t1.example');
          yield* Fiber.interrupt(running);
        }),
      ),
    ));

  it('backs off, longer each time, while Cloud Connect refuses every new Sign-in', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { host, signedInAt } = fake({
            healthy: () => true,
            answer: () => ({ _tag: 'SignedOut' }),
            backoff: '20 millis',
          });
          const running = yield* Effect.forkScoped(heartbeat(host));
          // Waits of 0, 20, 40, 80 and 160 ms: five Sign-ins by 300 ms.
          yield* eventually(() => expect(signedInAt.length).toBe(5));
          yield* Effect.sleep('100 millis');
          expect(signedInAt.length).toBe(5);
          const gaps = signedInAt.slice(1).map((at, i) => at - signedInAt[i]!);
          expect(gaps[3]!).toBeGreaterThanOrEqual(160);
          expect(gaps[3]!).toBeGreaterThan(gaps[1]! * 2);
          yield* Fiber.interrupt(running);
        }),
      ),
    ));

  it('signs in again at once after a Report was taken since the last refusal', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          // Refused, taken from the second tunnel, then refused again.
          let refusals = 0;
          let taken = false;
          const { host, signIns } = fake({
            healthy: () => true,
            answer: (report) => {
              if (refusals === 0 || (taken && refusals === 1)) {
                refusals++;
                return { _tag: 'SignedOut' };
              }
              if (addressOf(report) === 'https://t2.example') taken = true;
              return { _tag: 'Reported' };
            },
            backoff: '1 minute',
          });
          const running = yield* Effect.forkScoped(heartbeat(host));
          yield* eventually(() => expect(signIns()).toBe(2));
          yield* Fiber.interrupt(running);
        }),
      ),
    ));

  it('stops when signing in again fails, or Cloud Connect refuses the Connection', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const signedOut = fake({
          healthy: () => true,
          answer: () => ({ _tag: 'SignedOut' }),
          signInAgain: Effect.fail('someone else'),
        });
        expect(yield* Effect.scoped(heartbeat(signedOut.host))).toEqual({
          _tag: 'Stopped',
          reason: 'someone else',
        });
        const refused = fake({
          healthy: () => true,
          answer: () => ({ _tag: 'Refused', reason: 'taken' }),
        });
        expect(yield* Effect.scoped(heartbeat(refused.host))).toEqual({
          _tag: 'Stopped',
          reason: 'taken',
        });
      }),
    ));
});
