import { chmodSync, existsSync } from 'node:fs';
import { Console, Context, Effect, Layer } from 'effect';
import { HeartbeatClient } from './cloud/index.js';
import {
  claim,
  forget as forgetHere,
  found,
  ofCloud,
} from './connection-file/index.js';
import { signIn, stored } from './sign-in/index.js';

export {
  type ConnectionFolders,
  connectionFolders,
  connectionNames,
  deleteFolders,
} from './folders.js';
export { hostName } from './connection-file/index.js';

/*
 * Who this Connection is, before and without its Actor tree: its folders
 * (folders.ts), the one Connection its connection.json is
 * (connection-file/), and the User it is signed in as (sign-in/).
 *
 * `identify` comes first: it signs in, finds the Connection, and gives Connect
 * Cloud's client signed as that User. `forget` undoes both; `kept` reads the
 * Connection without signing in, for `list` and `remove`.
 */

/** Fails unless the Connection kept in `connectionFile`, if any, belongs to `cloud`; before anyone signs in. */
export const belongsTo = (connectionFile: string, cloud: string) =>
  ofCloud({ file: connectionFile, cloud });

interface Where {
  /** Connect Cloud's base URL. */
  readonly cloud: string;
  /** The SQLite database file, which keeps the Sign-in. */
  readonly db: string;
  /** The Connection's connection.json. */
  readonly connectionFile: string;
  /** This Connect's version. */
  readonly version: string;
}

/** Connect Cloud at `cloud`, called as `ke-connect` at `version`, its calls signed by `signing`, for as long as the Scope. */
const clientAt = (
  { cloud, version }: Pick<Where, 'cloud' | 'version'>,
  signing: Layer.Layer<unknown>,
) =>
  Effect.map(
    Layer.build(
      HeartbeatClient.layer(cloud, version).pipe(Layer.provide(signing)),
    ),
    (context) => Context.get(context, HeartbeatClient),
  );

/** Keeps the database 0600 once it is there. */
const ownDb = (db: string) =>
  Effect.sync(() => {
    if (existsSync(db)) chmodSync(db, 0o600);
  });

/**
 * Signs in and finds which Connection this is, making it on the first run,
 * named `firstName`, for as long as the Scope: the Connection (its id and
 * name), the User, the Sign-in, and Connect Cloud's client signed with it.
 */
export const identify = (
  options: Where & { readonly firstName: string; readonly startedAt: number },
) =>
  Effect.gen(function* () {
    const session = yield* signIn(options);
    const owner = { id: session.user.id, email: session.user.email };
    const connection = yield* claim({
      file: options.connectionFile,
      owner,
      cloud: options.cloud,
      firstName: options.firstName,
      startedAt: options.startedAt,
    });
    // Signing in opened the database first.
    yield* ownDb(options.db);
    const client = yield* clientAt(options, session.signing);
    return { ...options, connection, user: session.user, session, client };
  });

/**
 * Asks Connect Cloud to forget the Connection, signs out, revoking the
 * Sign-in, and forgets the Connection here. A Connect Cloud that cannot be
 * told is only logged: the Sign-in revoked, it can never Report again. One
 * that refuses this `ke-connect` as Outdated keeps listing it, which is said
 * plainly, with Connect Cloud's line: only the App can forget it then.
 */
export const forget = (options: Where) =>
  Effect.scoped(
    Effect.gen(function* () {
      const kept = { file: options.connectionFile };
      const connection = yield* found(kept);
      const session = yield* stored(options);
      if (connection !== null && session.signing !== null) {
        const client = yield* clientAt(options, session.signing);
        yield* client.Forget({ id: connection.id }).pipe(
          Effect.catchTag('Outdated', ({ line }) =>
            Console.error(
              `${line}\nConnect Cloud still lists ${connection.name}, as this ke-connect is too old to have it forgotten: forget it from the app.`,
            ),
          ),
          Effect.catch((error) =>
            Effect.logWarning(
              `${options.cloud} could not be told to forget ${connection.name}; Forget it from the app`,
              error,
            ),
          ),
        );
      }
      yield* session.signOut;
      yield* forgetHere(kept);
    }),
  );

/** The Connection kept in `connectionFile`, without signing in; null when there is none yet. */
export const kept = (connectionFile: string) => found({ file: connectionFile });
