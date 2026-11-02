import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import type { Connection } from '../../../../../cloud/contract/index.js';
import { cloud, type CloudOptions } from '../cloud.js';

/* How Cloud reads Cloud Connect's answer to a Report, against a fake client. */

/** A Report, sent to a client whose `Report` answers with `answer`. */
const sent = (answer: Effect.Effect<unknown>) =>
  cloud({
    client: { Report: () => answer } as unknown as CloudOptions['client'],
    connection: { id: 'c', name: 'n', key: 'k' },
    version: '0.0.3',
    user: { id: 'u', email: 'u@test' },
    signInAgain: Effect.die('unused'),
    heartbeat: 10,
  }).report({ status: { _tag: 'Opening' }, plugins: {} });

const answered = (answer: Partial<Connection>) =>
  sent(
    Effect.succeed({
      wanted: { code: { hash: 'h', url: 'u' } },
      minConnect: null,
      ...answer,
    }),
  );

describe('a Report’s answer', () => {
  it('is the Plugins to run, or Outdated below the Minimum Connect', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        expect(
          yield* answered({ version: '0.0.3', minConnect: '0.0.3' }),
        ).toEqual({
          _tag: 'Reported',
          wanted: { code: { hash: 'h', url: 'u' } },
        });
        expect(yield* answered({ version: '0.0.3', minConnect: null })).toEqual(
          expect.objectContaining({ _tag: 'Reported' }),
        );
        expect(
          yield* answered({ version: '0.0.3', minConnect: '0.0.4' }),
        ).toEqual({ _tag: 'Outdated', version: '0.0.3', minConnect: '0.0.4' });
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
