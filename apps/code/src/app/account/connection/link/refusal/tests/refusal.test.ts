import { Effect } from 'effect';
import { RpcClientError } from 'effect/rpc';
import { Socket } from 'effect/socket';
import { VersionGap } from '@kestack/rpc-toolkit/rpc/version-gap';
import { describe, expect, it } from 'vitest';
import { orRefused, reasonOf } from '../refusal.ts';

/*
 * A call that failed because one side is older says which: a Connection
 * that lacks the call, or cannot read what Code sent, needs a newer Connect.
 * One that failed on the socket says the Connection could not be reached,
 * not the socket's code.
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

  it("says a Connection out of reach could not be reached, not the socket's code", () => {
    const closed = new RpcClientError.RpcClientError({
      reason: new Socket.SocketCloseError({ code: 1006 }),
    });
    expect(closed.message).toBe('SocketCloseError: 1006');
    expect(reasonOf(closed)).toBe('The Connection could not be reached');
  });
});
