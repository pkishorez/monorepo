import { Effect } from 'effect';
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

/**
 * Runs `use` with the Kabuki Session named `name`, through the DevTools
 * Server at `baseUrl`; fails with the live names when it is not there.
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
      return yield* use(yield* dialSession(baseUrl, name));
    }),
  );
