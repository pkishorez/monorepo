import { Effect, Scope } from 'effect';
import type { ConnectionStatus } from '../../../../heartbeat/index.js';
import { cloud } from './cloud/index.js';
import { belongsTo, identify } from './identity.js';

/*
 * What Identity stands on: the User's account on Connect Cloud, for as long
 * as the Scope. Signing in runs inside the Actor tree, whose Worker ends with
 * its State, but the Sign-in and the client it signs must outlast it, so they
 * live in a Scope of their own, made as this is built: built before the tree
 * starts, it closes after the tree stops, so nothing below ever signs a call
 * with a closed database. Signing out is only for the program
 * itself, which does it once the Connection was forgotten.
 */

export interface AccountOptions {
  /** Connect Cloud's base URL. */
  readonly cloud: string;
  /** The SQLite database file, which keeps the Sign-in. */
  readonly db: string;
  /** The Connection's connection.json. */
  readonly connectionFile: string;
  /** This `ke-connect`'s version. */
  readonly version: string;
  /** The Connection's name on this computer. */
  readonly name: string;
  /** What a new Connection is first called. */
  readonly firstName: string;
  /** When this run started. */
  readonly startedAt: number;
  /** Seconds between Heartbeats. */
  readonly heartbeat: number;
}

/** Wait before signing in again once a new Sign-in was refused too; it doubles after, up to a minute. */
const FIRST_BACKOFF = '1 second';

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** The account `options` names, signed in by nothing yet. */
export const account = (options: AccountOptions) =>
  Effect.gen(function* () {
    const scope = yield* Effect.flatMap(Effect.scope, (outer) =>
      Scope.fork(outer),
    );
    let signedIn: {
      readonly client: ReturnType<typeof cloud>;
      readonly signOut: Effect.Effect<void>;
    } | null = null;

    const signIn = Effect.gen(function* () {
      yield* belongsTo(options.connectionFile, options.cloud);
      const identified = yield* identify(options);
      const { connection, user, session } = identified;
      yield* Effect.log(`Connection ${connection.name} (${connection.id})`);
      yield* Effect.log(`signed in as ${user.email} to ${options.cloud}`);
      signedIn = {
        signOut: session.signOut,
        client: cloud({
          client: identified.client,
          connection,
          version: options.version,
          user,
          signInAgain: session.signInAgain,
        }),
      };
      return { id: connection.id };
    });

    /** What only runs once signed in, which Identity sees to. */
    const once = <A, E>(
      then: (client: ReturnType<typeof cloud>) => Effect.Effect<A, E>,
    ) =>
      Effect.suspend(() =>
        signedIn === null
          ? Effect.die(new Error('Not signed in yet'))
          : then(signedIn.client),
      );

    return {
      identify: signIn.pipe(Scope.provide(scope), Effect.mapError(messageOf)),
      signInAgain: once(({ signInAgain }) => signInAgain),
      backoff: FIRST_BACKOFF,
      every: `${options.heartbeat} seconds`,
      report: (status: ConnectionStatus, key: string) =>
        once(({ report }) => report(status, key)),
      signOut: Effect.suspend(() => signedIn?.signOut ?? Effect.void),
    } as const;
  });
