import { HttpClientError, HttpClientRequest } from 'effect/http';
import { RpcClientError } from 'effect/rpc';
import { describe, expect, it } from 'vitest';
import { cloudProblemOf } from '../account.ts';

/*
 * Why Connect Cloud could not be asked, as the app says it: an RPC client's
 * failed HTTP call says what its reason says, without the `HttpError:` the
 * error itself puts first; any other error, its own words; none, a plain line.
 */

/** A call that never reached Connect Cloud, as the RPC client fails it. */
const unreached = (description?: string) =>
  new RpcClientError.RpcClientError({
    reason: HttpClientError.HttpClientErrorSchema.fromHttpClientError(
      new HttpClientError.HttpClientError({
        reason: new HttpClientError.TransportError({
          request: HttpClientRequest.post('https://connect.example/rpc/app'),
          ...(description === undefined ? {} : { description }),
        }),
      }),
    ),
  });

describe('cloudProblemOf', () => {
  it("says a failed HTTP call's cause, not the bare HttpError", () => {
    expect(unreached('Failed to fetch').message).toBe(
      'HttpError: Transport: Failed to fetch (POST https://connect.example/rpc/app)',
    );
    expect(cloudProblemOf(unreached('Failed to fetch'))).toBe(
      'Transport: Failed to fetch (POST https://connect.example/rpc/app)',
    );
    expect(cloudProblemOf(unreached())).toBe(
      'Transport error (POST https://connect.example/rpc/app)',
    );
  });

  it('says any other error in its own words, and a plain line for none', () => {
    expect(cloudProblemOf(new Error('Not allowed'))).toBe('Not allowed');
    expect(cloudProblemOf({ _tag: 'Refused', message: '' })).toBe(
      'Connect Cloud could not be reached',
    );
    expect(cloudProblemOf(undefined)).toBe(
      'Connect Cloud could not be reached',
    );
  });
});
