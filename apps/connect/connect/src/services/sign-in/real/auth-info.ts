import { Effect, Schema } from 'effect';
import { AUTH_PATH, AuthInfo } from '@kestack/connect-cloud/heartbeat';

const at = (base: string, path: string) => `${base.replace(/\/+$/, '')}${path}`;

const reason = (cause: unknown): string => {
  if (!(cause instanceof Error)) return String(cause);
  const inner = cause.cause;
  return inner instanceof Error
    ? `${cause.message}: ${inner.message}`
    : cause.message;
};

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
