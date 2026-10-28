import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { addressOf } from '../../../cloud/contract/index.js';
import { eventually, fake, start } from './fixtures/connection.js';

/*
 * The Connection online: its tunnel, each generation a Child of its own,
 * its Heartbeat, and signing in again, against a fake tunnel and a fake
 * Cloud Connect.
 */

describe('a Connection online', () => {
  it('reports cloudflared downloading, then the tunnel opening, then up, at the router’s port', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { host, reports, ports } = fake({
            healthy: () => true,
            cloudflared: Effect.as(
              Effect.sleep('700 millis'),
              '/bin/cloudflared',
            ),
          });
          const { root } = yield* start(host);
          yield* eventually(() =>
            expect(reports.at(-1)?._tag).toBe('Reachable'),
          );
          const tags = reports.map(({ _tag }) => _tag).join(',');
          // Opening at first, until getting cloudflared takes a while.
          expect(tags).toMatch(
            /^(Opening,)*(Installing,)+Opening,.*Reachable$/,
          );
          expect(ports).toEqual([root().model.listening]);
          expect(ports[0]).toBeGreaterThan(0);
        }),
      ),
    ));

  it('reports why the tunnel could not open', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { host, reports } = fake({
            healthy: () => true,
            cloudflared: Effect.fail(new Error('download timed out')),
          });
          yield* start(host);
          yield* eventually(() =>
            expect(reports).toContainEqual(
              expect.objectContaining({
                _tag: 'OpenFailed',
                problem: 'download timed out',
              }),
            ),
          );
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
          yield* start(host);
          yield* eventually(() =>
            expect(
              reports.some(
                (report) => addressOf(report) === 'https://t2.example',
              ),
            ).toBe(true),
          );
          expect(opened).toEqual(['https://t1.example', 'https://t2.example']);
          expect(closed).toEqual(['https://t1.example']);
          const failures = reports.filter(
            (report) =>
              report._tag === 'Unreachable' &&
              report.url === 'https://t1.example',
          );
          expect(failures.length).toBe(2);
        }),
      ),
    ));

  it('keeps the tunnel while checks fail fewer than three times in a row', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          let checks = 0;
          const { host, opened, reports } = fake({
            healthy: () => checks++ % 2 === 0,
          });
          yield* start(host);
          yield* eventually(() => expect(reports.length).toBeGreaterThan(10));
          expect(opened).toEqual(['https://t1.example']);
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
              return { _tag: 'Reported', wanted: {} };
            },
          });
          yield* start(host);
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
          yield* start(host);
          // Waits of 0, 20, 40, 80 and 160 ms: five Sign-ins by 300 ms.
          yield* eventually(() => expect(signedInAt.length).toBe(5));
          yield* Effect.sleep('100 millis');
          expect(signedInAt.length).toBe(5);
          const gaps = signedInAt.slice(1).map((at, i) => at - signedInAt[i]!);
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
          const { host, signIns } = fake({
            healthy: () => true,
            answer: (report) => {
              if (refusals === 0 || (taken && refusals === 1)) {
                refusals++;
                return { _tag: 'SignedOut' };
              }
              // Taken from the tunnel opened once signed in again.
              if (addressOf(report) !== null) taken = true;
              return { _tag: 'Reported', wanted: {} };
            },
            backoff: '1 minute',
          });
          yield* start(host);
          yield* eventually(() => expect(signIns()).toBe(2));
        }),
      ),
    ));
});
