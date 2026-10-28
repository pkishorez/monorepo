import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { reach } from '@kestack/cli-platform/single';
import { ConnectionControl } from '../index.js';
import {
  eventually,
  fake,
  inputOf,
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

          const second = yield* start(
            fake({ healthy: () => true }).host,
            input,
          );
          expect(yield* second.ended).toEqual({
            _tag: 'Stopped',
            reason: 'test is already running',
          });

          yield* Effect.forkScoped(control.stop());
          expect(yield* first.ended).toEqual({ _tag: 'Stopped', reason: null });
        }),
      ),
    ));
});
