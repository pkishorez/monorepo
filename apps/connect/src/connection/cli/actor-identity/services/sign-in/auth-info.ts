import { Effect, Schema } from 'effect';
import { AUTH_PATH, AuthInfo } from '../../../../../heartbeat/index.js';

/* How Connect Cloud says to sign in, asked at its `GET /auth`. */

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
