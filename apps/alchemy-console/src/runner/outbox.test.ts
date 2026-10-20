import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import type { RunnerEvent } from '../shared/contracts/run/index.ts';
import { makeOutbox } from './outbox.ts';

/*
 * The outbox, sending to a test: nothing leaves with a secret in it, a log
 * line, an event or a result, once the outbox knows the secret.
 */

const KEY = 'cf-api-token-0123456789abcdef';

describe('makeOutbox', () => {
  it('scrubs a secret learned mid-run from lines, events and results alike', async () => {
    const sent = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const events: Array<RunnerEvent> = [];
          const lines: Array<string> = [];
          const outbox = yield* makeOutbox({
            report: (_, event) => Effect.sync(() => void events.push(event)),
            log: (_, batch) => Effect.sync(() => void lines.push(...batch)),
          });
          outbox.redact(KEY);
          outbox.redact('short');
          outbox.line(`token ${KEY} in a line, and a short word`);
          yield* outbox.event({
            _tag: 'ResourceStatus',
            fqn: 'Worker',
            logicalId: 'Worker',
            resourceType: 'Cloudflare.Worker',
            status: 'fail',
            message: `refused ${KEY}`,
          });
          yield* outbox.flush;
          const result = outbox.scrub({
            _tag: 'Failed' as const,
            message: `The deploy failed: Bearer ${KEY}`,
          });
          return { events, lines, result };
        }),
      ),
    );
    expect(sent.lines).toEqual(['token *** in a line, and a short word']);
    expect(sent.events).toMatchObject([{ message: 'refused ***' }]);
    expect(sent.result).toEqual({
      _tag: 'Failed',
      message: 'The deploy failed: Bearer ***',
    });
  });
});
