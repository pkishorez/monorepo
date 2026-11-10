import { Effect } from 'effect';
import { Authz } from '@kestack/auth-toolkit';
import { AppApi } from '../../app-api/index.js';
import {
  Connections,
  type Latest,
  type ReleaseFiles,
  standingOf,
} from '../store/index.js';

/*
 * What Connect Cloud answers an App, for the signed-in caller: its
 * Connections, each with what every Connection is told, `latest`; a Rename or
 * a Forget of one of them; and where a Release stands, by `latest.wanted` and
 * `files`.
 */

/** The handlers of `AppApi`, over the `connections` table. */
export const appHandlers = (latest: Latest, files: ReleaseFiles | undefined) =>
  AppApi.toLayer({
    List: () =>
      Effect.flatMap(Authz.User, (principal) =>
        Effect.map(Connections.list(principal), (connections) =>
          connections.map((connection) => ({ ...connection, ...latest })),
        ),
      ),
    Forget: ({ id }) =>
      Effect.flatMap(Authz.User, (principal) =>
        Connections.forget(principal, id),
      ),
    Rename: ({ id, displayName }) =>
      Effect.flatMap(Authz.User, (principal) =>
        Connections.rename(principal, id, displayName),
      ),
    // Signed in, as every call is; whose call it is changes nothing.
    Standing: ({ plugin, hash }) =>
      Effect.andThen(
        Authz.User,
        standingOf(latest.wanted, files, plugin, hash),
      ),
  });
