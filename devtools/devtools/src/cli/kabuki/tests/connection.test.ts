import { Effect } from 'effect';
import { RpcClientError } from 'effect/rpc';
import { Socket } from 'effect/socket';
import { describe, expect, test } from 'vitest';
import { describeClientError } from '../../client-command/errors.js';
import { whileConnected } from '../connection.js';

const closed = (code: number) =>
  new RpcClientError.RpcClientError({
    reason: new Socket.SocketCloseError({ code }),
  });

describe('a Kabuki Session that goes mid-call', () => {
  test('says so by name, not as a socket closing', async () => {
    const error = await Effect.runPromise(
      Effect.flip(whileConnected('calm-otter', Effect.fail(closed(1000)))),
    );
    expect(describeClientError(error, 'http://127.0.0.1:14400')).toBe(
      'The Kabuki Session calm-otter disconnected.',
    );
  });

  test('leaves every other failure as it was', async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        whileConnected(
          'calm-otter',
          Effect.fail({ _tag: 'StepNotFound', step: 9, oldest: 0, newest: 3 }),
        ),
      ),
    );
    expect(error).toEqual({
      _tag: 'StepNotFound',
      step: 9,
      oldest: 0,
      newest: 3,
    });
  });
});
