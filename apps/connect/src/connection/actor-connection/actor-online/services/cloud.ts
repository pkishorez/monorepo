import { Effect } from 'effect';
import type { PluginState } from '@kestack/cli-platform/plugins/contract';
import type { CloudClient } from '../../../../cloud/client/index.js';
import type { ConnectionStatus } from '../../../../cloud/contract/index.js';

/*
 * What Cloud stands on: Cloud Connect's client, signed in as the Connection's
 * User. A Report is answered with the version of each Plugin to run, or
 * with why it was not taken; signing in again must come back as the same
 * User.
 */

/** Wait before signing in again once a new Sign-in was refused too; it doubles after, up to a minute. */
const FIRST_BACKOFF = '1 second';

interface User {
  readonly id: string;
  readonly email: string;
}

export interface CloudOptions {
  /** Cloud Connect's client, its calls signed. */
  readonly client: CloudClient['Service'];
  readonly connection: {
    readonly id: string;
    readonly name: string;
    readonly key: string;
  };
  /** This Connect's version. */
  readonly version: string;
  /** The User the Connection belongs to. */
  readonly user: User;
  /** A new Sign-in, after Cloud Connect refused the one stored: who signed in. */
  readonly signInAgain: Effect.Effect<User, unknown>;
  /** Seconds between Heartbeats. */
  readonly heartbeat: number;
}

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

/** Cloud for the Connection `options` names: its Heartbeat's interval, a Report, and signing in again. */
export const cloud = (options: CloudOptions) => {
  const { client, connection, version, user } = options;
  return {
    every: `${options.heartbeat} seconds`,
    report: ({
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
        ),
    backoff: FIRST_BACKOFF,
    signInAgain: options.signInAgain.pipe(
      Effect.mapError((error) =>
        error instanceof Error ? error.message : String(error),
      ),
      Effect.flatMap((again) =>
        again.id === user.id
          ? Effect.void
          : Effect.fail(
              `Signed in as ${again.email}, but this Connection is ${user.email}'s. Serve another name.`,
            ),
      ),
    ),
  } as const;
};
