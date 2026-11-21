import { existsSync } from 'node:fs';
import { Console, Context, Effect, Layer } from 'effect';
import { HeartbeatClient } from './cloud/index.js';
import { claim, forget as forgetHere, found, ofCloud } from './connection.js';
import { signIn, stored } from './sign-in/index.js';
import {
  connection as connectionEntity,
  openStore,
  readStore,
} from './store/index.js';

export {
  type ConnectionFolders,
  connectionFolders,
  connectionNames,
  deleteFolders,
} from './folders.js';
export { hostName } from './connection.js';
export { migrate } from './migrations/index.js';

/*
 * Who this Connection is, before and without its Actor tree: its folders
 * (folders.ts), ke-connect.db (store/) and what moves an older folder into
 * it (migrations/), the one Connection it keeps (connection.ts), and the
 * User it is signed in as (sign-in/).
 *
 * `identify` comes first: it opens ke-connect.db, signs in, finds the
 * Connection, and gives Connect Cloud's client signed as that User.
 * `forget` undoes both; `kept` reads the Connection without signing in, for
 * `list` and `remove`.
 */

interface Where {
  /** Connect Cloud's base URL. */
  readonly cloud: string;
  /** ke-connect.db, which keeps the Connection and its Sign-in. */
  readonly db: string;
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

/**
 * Signs in and finds which Connection this is, making it on the first run,
 * named `firstName`, for as long as the Scope: the Connection (its id and
 * name), the User, the Sign-in, and Connect Cloud's client signed with it.
 * A Connection of another Connect Cloud is refused before anyone signs in.
 */
export const identify = (
  options: Where & { readonly firstName: string; readonly startedAt: number },
) =>
  Effect.gen(function* () {
    const store = yield* openStore(options.db);
    yield* ofCloud(store, options.cloud);
    const session = yield* signIn({ ...options, store });
    const owner = { id: session.user.id, email: session.user.email };
    const connection = yield* claim(store, {
      owner,
      cloud: options.cloud,
      firstName: options.firstName,
      startedAt: options.startedAt,
    });
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
      const store = yield* openStore(options.db);
      const connection = yield* found(store);
      const session = yield* stored({ ...options, store });
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
      yield* forgetHere(store);
    }),
  );

/**
 * The Connection kept in `db`, without signing in; null when there is none
 * yet. `db` is only read, never made or set up, so `list` can read it while
 * `serve` runs.
 */
export const kept = (db: string) =>
  existsSync(db)
    ? Effect.scoped(
        Effect.flatMap(readStore(db), (table) =>
          connectionEntity.get().pipe(
            Effect.map(({ value }) => value.connection),
            Effect.provide(table),
          ),
        ),
      )
    : Effect.succeed(null);
