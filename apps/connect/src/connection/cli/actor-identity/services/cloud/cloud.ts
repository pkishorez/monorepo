import { Effect } from 'effect';
import type { ConnectionStatus } from '../../../../../heartbeat/index.js';
import type { HeartbeatClient } from './client.js';

export { HeartbeatClient, Outdated } from './client.js';

/*
 * Connect Cloud's Heartbeat client (client.ts), signed in as the Connection's
 * User. A Report is answered with the Release of each Plugin to run, or with
 * why it was not taken; one Connect Cloud answers 426, below its Minimum
 * Connect, is Outdated, with the line it sent. Only `Unauthenticated`, which
 * Connect Cloud answers once the Auth Worker said this Sign-in names nobody,
 * is SignedOut; anything else that goes wrong, a crash on either side
 * included, leaves it Unsent, so the next Heartbeat tries again. Signing in
 * again must come back as the same User.
 */

/** How long Connect Cloud has to answer a Report before it is Unsent, so a stalled one never holds up the Heartbeat. */
const ANSWER = '10 seconds';

interface User {
  readonly id: string;
  readonly email: string;
}

export interface CloudOptions {
  /** Connect Cloud's client, its calls signed. */
  readonly client: HeartbeatClient['Service'];
  readonly connection: {
    readonly id: string;
    readonly name: string;
  };
  /** This `ke-connect`'s version. */
  readonly version: string;
  /** The User the Connection belongs to. */
  readonly user: User;
  /** A new Sign-in, after Connect Cloud refused the one stored: who signed in. */
  readonly signInAgain: Effect.Effect<User, unknown>;
}

/** How a Report's failure stands for the Heartbeat. */
const outcomeOf = (error: unknown) => {
  const tag = (error as { readonly _tag?: string })._tag;
  switch (tag) {
    case 'Outdated':
      return {
        _tag: 'Outdated',
        line: (error as { readonly line: string }).line,
      } as const;
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

/** Why a Report crashed: its name and message, as a crash from Connect Cloud arrives with no more. */
const crashOf = (defect: unknown) => {
  const why =
    defect instanceof Error
      ? [defect.name, defect.message].filter(Boolean).join(': ')
      : String(defect);
  return { _tag: 'Unsent', problem: `the Report crashed (${why})` } as const;
};

/** Connect Cloud for the Connection `options` names: a Report, and signing in again. */
export const cloud = (options: CloudOptions) => {
  const { client, connection, version, user } = options;
  return {
    report: (status: ConnectionStatus, key: string) =>
      client
        .Report({
          id: connection.id,
          name: connection.name,
          key,
          version,
          status,
        })
        .pipe(
          Effect.map(
            (answer) => ({ _tag: 'Reported', wanted: answer.wanted }) as const,
          ),
          Effect.catch((error) => Effect.succeed(outcomeOf(error))),
          Effect.catchDefect((defect) => Effect.succeed(crashOf(defect))),
          Effect.timeoutOrElse({
            duration: ANSWER,
            orElse: () =>
              Effect.succeed({
                _tag: 'Unsent',
                problem: `Connect Cloud did not answer in ${ANSWER}`,
              } as const),
          }),
        ),
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
