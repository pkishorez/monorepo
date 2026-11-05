import { Effect, type Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { addressOf } from '../../../../../contract/index.js';
import { eventually, fake, start } from './fixtures/connection.js';

/*
 * The tunnel: its generations and its Reports, against a fake tunnel and a fake
 * Connect Cloud.
 */

const run = (effect: Effect.Effect<void, never, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

describe('a tunnel', () => {
  it('reports cloudflared downloading, then the tunnel opening, then up, at the server’s port', () =>
    run(
      Effect.gen(function* () {
        const { host, reports, ports } = fake({
          healthy: () => true,
          cloudflared: () =>
            Effect.as(Effect.sleep('700 millis'), '/bin/cloudflared'),
        });
        const { listening } = yield* start(host);
        yield* eventually(() =>
          expect(reports.at(-1)).toMatchObject({
            _tag: 'Ready',
            check: { _tag: 'Reachable' },
          }),
        );
        const steps = reports
          .map((report) =>
            report._tag === 'SettingUp' ? report.step._tag : report.check._tag,
          )
          .join(',');
        // Opening at first, until getting cloudflared takes a while. The fake
        // opens at once, so a Report of Opening after it may not get to go.
        expect(steps).toMatch(
          /^(Opening,)*(Downloading,)+(Opening,)*.*Reachable$/,
        );
        expect(ports).toEqual([listening().port]);
        expect(ports[0]).toBeGreaterThan(0);
      }),
    ));

  it('reports why the tunnel could not open', () =>
    run(
      Effect.gen(function* () {
        const { host, reports } = fake({
          healthy: () => true,
          cloudflared: () => Effect.fail(new Error('download timed out')),
        });
        yield* start(host);
        yield* eventually(() =>
          expect(reports).toContainEqual({
            _tag: 'SettingUp',
            step: {
              _tag: 'Failed',
              at: expect.any(Number),
              problem: 'download timed out',
            },
          }),
        );
      }),
    ));

  it('restarts the tunnel after three failed checks in a row, and reports the new address', () =>
    run(
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
            report._tag === 'Ready' &&
            report.url === 'https://t1.example' &&
            report.check._tag === 'Unreachable',
        );
        expect(failures.length).toBe(2);
      }),
    ));

  it('keeps the tunnel while checks fail fewer than three times in a row', () =>
    run(
      Effect.gen(function* () {
        let checks = 0;
        const { host, opened, reports } = fake({
          healthy: () => checks++ % 2 === 0,
        });
        yield* start(host);
        yield* eventually(() => expect(reports.length).toBeGreaterThan(10));
        expect(opened).toEqual(['https://t1.example']);
      }),
    ));
});

describe('a word from a tunnel already replaced', () => {
  it('changes nothing while SettingUp', () =>
    run(
      Effect.gen(function* () {
        const { host, reports } = fake({
          healthy: () => true,
          neverOpens: true,
          every: '1 minute',
        });
        const { tunnel, sendTunnel } = yield* start(host);
        yield* eventually(() => expect(reports.length).toBeGreaterThan(0));
        for (const generation of [-1, 7]) {
          sendTunnel({ _tag: 'Up', generation, url: 'https://stale.example' });
          sendTunnel({ _tag: 'Lost', generation });
          sendTunnel({ _tag: 'Failed', generation, at: 1, problem: 'stale' });
          sendTunnel({
            _tag: 'Downloading',
            generation,
            elapsed: 1,
            received: 1,
          });
        }
        expect(tunnel()).toMatchObject({
          model: { generation: 0 },
          state: { _tag: 'SettingUp', step: { _tag: 'Opening' } },
        });
      }),
    ));

  it('changes nothing while Ready, and neither does any step', () =>
    run(
      Effect.gen(function* () {
        const { host, reports } = fake({
          healthy: () => true,
          every: '1 minute',
        });
        const { tunnel, sendTunnel } = yield* start(host);
        yield* eventually(() =>
          expect(reports.at(-1)).toMatchObject({ url: 'https://t1.example' }),
        );
        const ready = {
          _tag: 'Ready',
          url: 'https://t1.example',
          check: { _tag: 'Unchecked' },
        };
        sendTunnel({ _tag: 'Lost', generation: -1 });
        sendTunnel({
          _tag: 'Checked',
          generation: -1,
          check: { ok: false, at: 1, problem: 'stale' },
        });
        sendTunnel({ _tag: 'Up', generation: 0, url: 'https://late.example' });
        sendTunnel({ _tag: 'Opening', generation: 0 });
        sendTunnel({ _tag: 'Failed', generation: 0, at: 1, problem: 'late' });
        sendTunnel({
          _tag: 'Downloading',
          generation: 0,
          elapsed: 1,
          received: 1,
        });
        expect(tunnel()).toMatchObject({
          model: { generation: 0, failures: 0 },
          state: ready,
        });
      }),
    ));
});

describe('its Reports', () => {
  it('say the address at once as it is up, before any check', () =>
    run(
      Effect.gen(function* () {
        const { host, reports } = fake({
          healthy: () => true,
          every: '1 minute',
        });
        yield* start(host);
        yield* eventually(() =>
          expect(reports).toContainEqual({
            _tag: 'Ready',
            url: 'https://t1.example',
            check: { _tag: 'Unchecked' },
          }),
        );
      }),
    ));

  it('go at once while SettingUp, once for each step, then every `Cloud.every`', () =>
    run(
      Effect.gen(function* () {
        const quick = fake({
          healthy: () => true,
          neverOpens: true,
          every: '30 millis',
        });
        yield* start(quick.host);
        yield* eventually(() =>
          expect(quick.reports.length).toBeGreaterThan(3),
        );
        const slow = fake({
          healthy: () => true,
          neverOpens: true,
          every: '1 minute',
        });
        yield* start(slow.host);
        yield* Effect.sleep('200 millis');
        expect(slow.reports).toEqual([
          { _tag: 'SettingUp', step: { _tag: 'Opening' } },
        ]);
      }),
    ));

  it('answered with nothing change nothing', () =>
    run(
      Effect.gen(function* () {
        const { host, reports } = fake({
          healthy: () => true,
          answer: () => null,
        });
        const { root, pluginIds } = yield* start(host);
        yield* eventually(() => expect(reports.length).toBeGreaterThan(5));
        expect(root().model.wanted).toEqual({});
        expect(pluginIds()).toEqual([]);
      }),
    ));
});

describe('a download', () => {
  it('says how long and how much every interval, and each goes in a Report', () =>
    run(
      Effect.gen(function* () {
        const { host, reports } = fake({
          healthy: () => true,
          every: '1 minute',
          downloadEvery: '100 millis',
          cloudflared: (received) =>
            Effect.gen(function* () {
              yield* received(1_000);
              yield* Effect.sleep('300 millis');
              yield* received(2_000);
              yield* Effect.sleep('1 second');
              return '/bin/cloudflared';
            }),
        });
        yield* start(host);
        yield* eventually(() => expect(reports.at(-1)?._tag).toBe('Ready'));
        const steps = reports.flatMap((report) =>
          report._tag === 'SettingUp' && report.step._tag === 'Downloading'
            ? [report.step]
            : [],
        );
        // About (1300 - 500) / 100 of them: one each, however many fire.
        expect(steps.length).toBeGreaterThanOrEqual(4);
        expect(steps.length).toBeLessThanOrEqual(10);
        expect(steps[0]?.elapsed).toBeGreaterThanOrEqual(450);
        const elapsed = steps.map((step) => step.elapsed);
        expect(elapsed).toEqual([...elapsed].sort((a, b) => a - b));
        expect(new Set(elapsed).size).toBe(elapsed.length);
        expect(steps.at(-1)?.received).toBe(2_000);
      }),
    ));

  it('never shows for a cached binary', () =>
    run(
      Effect.gen(function* () {
        const { host, reports } = fake({ healthy: () => true });
        yield* start(host);
        yield* eventually(() => expect(reports.at(-1)?._tag).toBe('Ready'));
        expect(
          reports.some(
            (report) =>
              report._tag === 'SettingUp' && report.step._tag === 'Downloading',
          ),
        ).toBe(false);
      }),
    ));

  it('waiting on another Connection’s download has received nothing, and its time rises', () =>
    run(
      Effect.gen(function* () {
        const { host, reports } = fake({
          healthy: () => true,
          every: '1 minute',
          cloudflared: () => Effect.never,
        });
        yield* start(host);
        yield* eventually(() => expect(reports.length).toBeGreaterThan(3));
        const steps = reports.flatMap((report) =>
          report._tag === 'SettingUp' && report.step._tag === 'Downloading'
            ? [report.step]
            : [],
        );
        expect(steps.every(({ received }) => received === 0)).toBe(true);
        expect(steps.at(-1)?.elapsed).toBeGreaterThan(steps[0]?.elapsed ?? 0);
      }),
    ));

  it('stops telling as it fails, so the failure stands', () =>
    run(
      Effect.gen(function* () {
        const { host, reports } = fake({
          healthy: () => true,
          every: '1 minute',
          downloadEvery: '20 millis',
          cloudflared: () =>
            Effect.andThen(
              Effect.sleep('600 millis'),
              Effect.fail(new Error('no network')),
            ),
        });
        const { tunnel } = yield* start(host);
        yield* eventually(() =>
          expect(reports.at(-1)).toMatchObject({
            step: { _tag: 'Failed', problem: 'no network' },
          }),
        );
        yield* Effect.sleep('100 millis');
        expect(tunnel()).toMatchObject({
          state: { step: { _tag: 'Failed' } },
        });
      }),
    ));
});
