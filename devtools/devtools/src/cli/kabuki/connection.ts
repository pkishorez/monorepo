import { Effect } from 'effect';
import { RpcClientError } from 'effect/rpc';
import type { KabukiSessionClient } from '@kestack/devtools-kabuki/api';
import {
  KabukiSessionNotFound,
  dialSession,
  dialSessions,
} from '@kestack/devtools-kabuki/server';
import type { KabukiSessionsClient } from '@kestack/devtools-kabuki/server';

/** Runs `use` with the live Kabuki Sessions of the DevTools Server at `baseUrl`. */
export const withKabukiSessions = <A, E>(
  baseUrl: string,
  use: (sessions: KabukiSessionsClient) => Effect.Effect<A, E>,
) => Effect.scoped(Effect.flatMap(dialSessions(baseUrl), use));

/** `asked` of the Kabuki Session `name`, a socket closing under it said as that Kabuki Session going. */
export const whileConnected = <A, E>(
  name: string,
  asked: Effect.Effect<A, E>,
) =>
  asked.pipe(
    Effect.catchIf(
      (error): error is Extract<E, RpcClientError.RpcClientError> =>
        error instanceof RpcClientError.RpcClientError &&
        error.reason._tag === 'SocketCloseError',
      () => Effect.fail({ _tag: 'KabukiSessionDisconnected' as const, name }),
    ),
  );

/**
 * Runs `use` with the Kabuki Session named `name`, through the DevTools
 * Server at `baseUrl`; fails with the live names when it is not there, and
 * says so when it goes while asked.
 */
export const withKabukiSession = <A, E>(
  baseUrl: string,
  name: string,
  use: (client: KabukiSessionClient) => Effect.Effect<A, E>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const live = yield* withKabukiSessions(baseUrl, (sessions) =>
        sessions.list(),
      );
      if (!live.some((one) => one.name === name)) {
        return yield* new KabukiSessionNotFound({
          name,
          available: live.map((one) => one.name),
        });
      }
      return yield* whileConnected(
        name,
        use(yield* dialSession(baseUrl, name)),
      );
    }),
  );
