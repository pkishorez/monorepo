import { Effect, Schema } from 'effect';
import { AUTH_PATH, AuthInfo } from '../../../../contracts/heartbeat/index.js';
import { authWorker, type Store } from '../store/index.js';

/*
 * How Connect Cloud says to sign in, asked at its `GET /auth`, and what it
 * last said, kept in ke-connect.db with the Connect Cloud that said it: a
 * Connection started while Connect Cloud cannot be asked signs in the same
 * way, with the Sign-in it kept.
 */

/** `base` without a trailing slash, then `path`. */
const at = (base: string, path: string) => `${base.replace(/\/+$/, '')}${path}`;

/** Why a fetch failed, as plainly as it says: `fetch failed` hides the cause. */
const reason = (cause: unknown): string => {
  if (!(cause instanceof Error)) return String(cause);
  const inner = cause.cause;
  return inner instanceof Error
    ? `${cause.message}: ${inner.message}`
    : cause.message;
};

/** How a Connection signs in to Connect Cloud at `cloud`; fails when it cannot be asked. Interrupting it aborts the fetch. */
export const authInfo = (cloud: string) =>
  Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(at(cloud, AUTH_PATH), { signal });
      if (!response.ok) throw new Error(`${cloud} answered ${response.status}`);
      return (await response.json()) as unknown;
    },
    catch: (cause) =>
      new Error(
        `Could not ask ${cloud} how to sign in (${reason(cause)}); is Connect Cloud running?`,
        { cause },
      ),
  }).pipe(
    Effect.flatMap((body) =>
      Effect.mapError(
        Schema.decodeUnknownEffect(AuthInfo.schema)(body),
        (cause) => new Error(`${cloud} gave no AuthInfo`, { cause }),
      ),
    ),
  );

/** The AuthInfo `cloud` last gave; null when it gave none, or the store cannot say, with a warning. */
export const keptAuthInfo = (store: Store, cloud: string) =>
  authWorker.get().pipe(
    Effect.map(({ value }): AuthInfo | null =>
      value.authWorker?.cloud === cloud ? { url: value.authWorker.url } : null,
    ),
    Effect.provide(store.table),
    Effect.catch((error) =>
      Effect.as(
        Effect.logWarning(
          'Could not read the Auth Worker kept; it is ignored',
          error,
        ),
        null,
      ),
    ),
  );

/** Keeps `info` as the AuthInfo `cloud` gave; a failure is only logged. */
export const keepAuthInfo = (store: Store, cloud: string, info: AuthInfo) =>
  authWorker.put({ authWorker: { cloud, url: info.url } }).pipe(
    Effect.provide(store.table),
    Effect.asVoid,
    Effect.catch((error) =>
      Effect.logWarning(
        'Could not keep the Auth Worker Connect Cloud named',
        error,
      ),
    ),
  );
