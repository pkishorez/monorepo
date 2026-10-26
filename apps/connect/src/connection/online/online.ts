import { Context, Effect, Layer } from 'effect';
import type { PluginState } from '@kestack/cli-platform/plugins/contract';
import { CloudClient } from '../../cloud/client/index.js';
import type { ConnectionStatus } from '../../cloud/contract/index.js';
import {
  claim,
  forget as forgetHere,
  found,
  ofCloud,
} from './identity/index.js';
import { signIn, stored } from './sign-in/index.js';

export { checkAt, cloudflared, openTunnel } from './tunnel/index.js';

/** Fails unless the Connection kept in `connectionFile`, if any, belongs to `cloud`; before anyone signs in. */
export const belongsTo = (connectionFile: string, cloud: string) =>
  ofCloud({ file: connectionFile, cloud });

/*
 * This Connection as Cloud Connect knows it: signed in as one User, the one
 * Connection its connection.json is, reachable through a tunnel, and
 * reporting itself on every Heartbeat until it is forgotten or told to stop.
 *
 * `identify` comes first, since the router needs the Connection Key before
 * it listens; `cloud` then gives what each Heartbeat calls; `forget` undoes
 * both.
 */

interface Where {
  /** Cloud Connect's base URL. */
  readonly cloud: string;
  /** The SQLite database file, which keeps the Sign-in. */
  readonly db: string;
  /** The Connection's connection.json. */
  readonly connectionFile: string;
  /** This Connect's version. */
  readonly version: string;
}

/**
 * Signs in and finds which Connection this is, making it on the first run,
 * named `firstName`, for as long as the Scope: the Connection (its id, name
 * and key) and the User.
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
    return { ...options, connection, user: session.user, session };
  });

type Identified = Effect.Success<ReturnType<typeof identify>>;

/** Cloud Connect at `cloud`, its calls signed by `signing`, for as long as the Scope. */
const clientAt = (cloud: string, signing: Layer.Layer<unknown>) =>
  Effect.map(
    Layer.build(CloudClient.layer(cloud).pipe(Layer.provide(signing))),
    (context) => Context.get(context, CloudClient),
  );

/** How a Report's failure stands for the Heartbeat. */
const outcomeOf = (error: unknown) => {
  const tag = (error as { readonly _tag?: string })._tag;
  switch (tag) {
    case 'ConnectionForgotten':
      return { _tag: 'Forgotten' } as const;
    case 'Unauthenticated':
      return { _tag: 'SignedOut' } as const;
    case 'ConnectionTaken':
      return {
        _tag: 'Refused',
        reason:
          'Another User holds this Connection id. Run `ke-connect remove <name>` to start it again as a new Connection.',
      } as const;
    default:
      return {
        _tag: 'Unsent',
        problem: error instanceof Error ? error.message : String(tag ?? error),
      } as const;
  }
};

/**
 * What the identified Connection's Heartbeat calls on Cloud Connect, for as
 * long as the Scope: a Report, answered with the version of each Plugin to
 * run, or with why it was not taken; and signing in again, as the same
 * User, once Cloud Connect refused the Sign-in.
 */
export const cloud = (identified: Identified) =>
  Effect.gen(function* () {
    const { connection, session, version } = identified;
    const client = yield* clientAt(identified.cloud, session.signing);
    const report = ({
      status,
      plugins,
    }: {
      readonly status: ConnectionStatus;
      readonly plugins: Readonly<Record<string, PluginState>>;
    }) =>
      client
        .Report({
          id: connection.id,
          name: connection.name,
          key: connection.key,
          version,
          status,
          plugins,
        })
        .pipe(
          Effect.map(({ wanted }) => ({ _tag: 'Reported', wanted }) as const),
          Effect.catch((error) => Effect.succeed(outcomeOf(error))),
        );
    const again: Effect.Effect<
      { readonly id: string; readonly email: string },
      unknown
    > = session.signInAgain;
    const signInAgain = again.pipe(
      Effect.mapError((error) =>
        error instanceof Error ? error.message : String(error),
      ),
      Effect.flatMap((user) =>
        user.id === identified.user.id
          ? Effect.void
          : Effect.fail(
              `Signed in as ${user.email}, but this Connection is ${identified.user.email}'s. Serve another name.`,
            ),
      ),
    );
    return { report, signInAgain, signOut: session.signOut };
  });

/**
 * Asks Cloud Connect to forget the Connection, signs out, revoking the
 * Sign-in, and forgets the Connection here. A Cloud Connect that cannot be
 * told is only logged: the Sign-in revoked, it can never Report again.
 */
export const forget = (options: Where) =>
  Effect.scoped(
    Effect.gen(function* () {
      const kept = { file: options.connectionFile };
      const connection = yield* found(kept);
      const session = yield* stored(options);
      if (connection !== null && session.signing !== null) {
        const client = yield* clientAt(options.cloud, session.signing);
        yield* client
          .Forget({ id: connection.id })
          .pipe(
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
