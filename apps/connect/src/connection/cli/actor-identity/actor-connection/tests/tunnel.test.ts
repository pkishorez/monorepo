import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { addressOf } from '../../../../../contract/index.js';
import { eventually, fake, start } from './fixtures/connection.js';

/*
 * The tunnel: its generations and its Heartbeat, against a fake tunnel and a
 * fake Connect Cloud.
 */

describe('a tunnel', () => {
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
});
