import { Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';

/** `fetch` that acts as one account whichever is active: it sends the
 * account's Session token as `Authorization: Bearer` and never the cookie.
 * `token` is read on every request; while it is null, requests fail
 * without being sent. */
export const signedFetch = (token: () => string | null): typeof fetch =>
  ((input: RequestInfo | URL, init?: RequestInit) => {
    const current = token();
    if (current === null) {
      return Promise.reject(new Error('No token for this account yet'));
    }
    const headers = new Headers(init?.headers);
    headers.set('authorization', `Bearer ${current}`);
    return fetch(input, { ...init, headers, credentials: 'omit' });
  }) as typeof fetch;

/** `signedFetch` as the `fetch` of `FetchHttpClient.layer`, so every Effect
 * HTTP, RPC, or HttpApi client built on it is signed. */
export const signedFetchLayer = (token: () => string | null) =>
  FetchHttpClient.layer.pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, signedFetch(token))),
  );
