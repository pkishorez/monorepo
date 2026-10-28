import { mkdirSync, writeFileSync } from 'node:fs';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { reach } from '@kestack/cli-platform/single';
import { ConnectionControl, hold } from '../index.js';
import { remembered, rememberedFile } from '../remember.js';
import {
  eventually,
  fake,
  inputOf,
  release,
  runToEnd,
  start,
} from './fixtures/connection.js';

/*
 * How a Connection ends, and its control socket, real in a runtime folder
 * of the test's own.
 */

describe('a Connection', () => {
  it('ends Forgotten when Cloud Connect forgot the Connection', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const { host, closed } = fake({
          healthy: () => true,
          answer: (_, count) =>
            count >= 3
              ? { _tag: 'Forgotten' }
              : { _tag: 'Reported', wanted: {} },
        });
        expect(yield* runToEnd(host)).toEqual({ _tag: 'Forgotten' });
        yield* eventually(() => expect(closed).toEqual(['https://t1.example']));
      }),
    ));

  it('stops when signing in again fails, or Cloud Connect refuses the Connection', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const signedOut = fake({
          healthy: () => true,
          answer: () => ({ _tag: 'SignedOut' }),
          signInAgain: Effect.fail('someone else'),
        });
        expect(yield* runToEnd(signedOut.host)).toEqual({
          _tag: 'Stopped',
          reason: 'someone else',
        });
        const refused = fake({
          healthy: () => true,
          answer: () => ({ _tag: 'Refused', reason: 'taken' }),
        });
        expect(yield* runToEnd(refused.host)).toEqual({
          _tag: 'Stopped',
          reason: 'taken',
        });
      }),
    ));
});

describe('an Outdated Connection', () => {
  it('reports once, then stops, saying how to update', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const { host, reports } = fake({
          healthy: () => true,
          answer: () => ({
            _tag: 'Outdated',
            version: '0.0.3',
            minConnect: '0.0.4',
          }),
        });
        expect(yield* runToEnd(host)).toEqual({
          _tag: 'Stopped',
          reason:
            'ke-connect 0.0.3 is older than Cloud Connect accepts (0.0.4): run `npm i -g @kestack/connect@latest`, then serve again.',
        });
        expect(reports.length).toBeGreaterThan(0);
      }),
    ));
});

describe('what it last wanted', () => {
  it(
    'starts its Plugins at the Releases it last wanted while Cloud Connect cannot be reached',
    () =>
      Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const ping = release();
            const { host } = fake({
              healthy: () => true,
              answer: () => ({ _tag: 'Unsent', problem: 'offline' }),
            });
            const { root } = yield* start(host, {
              ...inputOf(),
              lastWanted: { ping },
            });
            yield* eventually(
              () =>
                expect(root().model.plugins['ping']).toEqual({
                  _tag: 'Running',
                  hash: ping.hash,
                }),
              20_000,
            );
          }),
        ),
      ),
    30_000,
  );

  it('keeps each answer on disk, and the answer wins over what it last wanted', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const before = release();
          const after = release('// newer\n');
          const { host } = fake({
            healthy: () => true,
            answer: () => ({ _tag: 'Reported', wanted: { ping: after } }),
          });
          const input = {
            ...inputOf(),
            lastWanted: { ping: before },
          };
          const { root } = yield* start(host, input);
          yield* eventually(() =>
            expect(root().model.wanted['ping']).toEqual(after),
          );
          yield* eventually(() =>
            expect(Effect.runSync(remembered(input.folders.data))).toEqual({
              ping: after,
            }),
          );
        }),
      ),
    ));

  it('reads nothing from no file, or one it cannot read', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const { folders } = inputOf();
        expect(yield* remembered(folders.data)).toEqual({});
        mkdirSync(folders.data, { recursive: true });
        writeFileSync(rememberedFile(folders.data), 'not json');
        expect(yield* remembered(folders.data)).toEqual({});
      }),
    ));
});

describe('its control socket', () => {
  it('says how it stands, stops it, and is held by one Connection of a name at a time', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const input = inputOf();
          const { host } = fake({ healthy: () => true });
          const first = yield* start(host, input);
          yield* eventually(() =>
            expect(first.root().model.url).toBe('https://t1.example'),
          );
          const control = yield* reach(input.control, ConnectionControl);
          expect(yield* control.status()).toEqual({
            name: 'test',
            id: 'connection-1',
            url: 'https://t1.example',
            plugins: {},
          });

          const second = yield* Effect.scoped(hold(input.control, input.name));
          expect(second._tag).toBe('AlreadyRunning');

          yield* Effect.forkScoped(control.stop());
          expect(yield* first.ended).toEqual({ _tag: 'Stopped', reason: null });
        }),
      ),
    ));

  it('says a Connection that has not started yet is starting, and stopping it ends the start', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const input = inputOf();
          const held = yield* hold(input.control, input.name);
          if (held._tag !== 'Held') return expect.fail('not held');
          const control = yield* reach(input.control, ConnectionControl);
          expect(yield* control.status()).toEqual({
            name: 'test',
            id: '',
            url: null,
            plugins: {},
          });
          yield* control.stop();
          yield* held.stopping;
        }),
      ),
    ));
});
