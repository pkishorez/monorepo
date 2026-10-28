import { Effect } from 'effect';
import { VersionGap } from '@kestack/connect/cloud';
import { describe, expect, it } from 'vitest';
import { orRefused, reasonOf } from '../refusal.ts';

/*
 * A call that failed because one side is older says which: a Connection
 * that lacks the call, or cannot read what Code sent, needs a newer Connect.
 */

describe('a refused call', () => {
  it('says a Connection older than Code needs a newer Connect', async () => {
    const ended = await Effect.runPromise(
      orRefused(Effect.fail(new VersionGap({ older: 'server' })), () => ({
        _tag: 'Done' as const,
      })),
    );
    expect(ended).toEqual({ _tag: 'Refused', reason: 'Needs a newer Connect' });
  });

  it('says Code older than its Connection is updating', () => {
    expect(reasonOf(new VersionGap({ older: 'client' }))).toBe(
      'Updating Code to its newest version',
    );
  });
});
