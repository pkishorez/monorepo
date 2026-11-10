import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { cloud, type CloudOptions, Outdated } from '../cloud.js';

/* How Connect Cloud's answer to a Report reads, against a fake client. */

/** A Report, sent to a client whose `Report` answers with `answer`. */
const sent = (
  answer: Effect.Effect<unknown, unknown>,
  told: (report: unknown) => void = () => {},
) =>
  cloud({
    client: {
      Report: (report: unknown) => {
        told(report);
        return answer;
      },
    } as unknown as CloudOptions['client'],
    connection: { id: 'c', name: 'n' },
    version: '0.0.3',
    user: { id: 'u', email: 'u@test' },
    signInAgain: Effect.die('unused'),
  }).report({ _tag: 'SettingUp', step: { _tag: 'Opening' } }, 'k3y');

describe('a Report', () => {
  it('carries the status and the key it is given', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const reports: Array<unknown> = [];
        yield* sent(Effect.succeed({ wanted: {} }), (report) =>
          reports.push(report),
        );
        expect(reports).toEqual([
          {
            id: 'c',
            name: 'n',
            key: 'k3y',
            version: '0.0.3',
            status: { _tag: 'SettingUp', step: { _tag: 'Opening' } },
          },
        ]);
      }),
    ));
});

describe('a Report’s answer', () => {
  it('is the Plugins to run', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const wanted = { code: { hash: 'h', url: 'u' } };
        expect(yield* sent(Effect.succeed({ wanted }))).toEqual({
          _tag: 'Reported',
          wanted,
        });
      }),
    ));

  it('is Outdated, with Connect Cloud’s line, when it refused this ke-connect as too old', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        expect(
          yield* sent(Effect.fail(new Outdated({ line: 'update me' }))),
        ).toEqual({ _tag: 'Outdated', line: 'update me' });
      }),
    ));
});

describe('a Report refused', () => {
  it('is SignedOut only when Connect Cloud says the Sign-in is gone', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        expect(yield* sent(Effect.fail({ _tag: 'Unauthenticated' }))).toEqual({
          _tag: 'SignedOut',
        });
        // The Auth Worker could not be asked: nothing is known of the login.
        expect(yield* sent(Effect.fail({ _tag: 'Unavailable' }))).toEqual({
          _tag: 'Unsent',
          problem: 'Unavailable',
        });
      }),
    ));
});

describe('a Report that crashed', () => {
  it('is Unsent, so the next Heartbeat tries again', () => {
    const crash = new Error('');
    crash.name = 'DatabaseError';
    return Effect.runPromise(
      Effect.gen(function* () {
        const answer = yield* sent(Effect.die(crash));
        expect(answer).toEqual({
          _tag: 'Unsent',
          problem: 'the Report crashed (DatabaseError)',
        });
      }),
    );
  });
});
