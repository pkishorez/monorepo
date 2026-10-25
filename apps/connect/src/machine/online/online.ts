import { Context, Data, Effect, Layer } from 'effect';
import { CloudClient } from '../../cloud/client/index.js';
import type { MachineStatus } from '../../cloud/contract/index.js';
import { heartbeat } from './heartbeat/index.js';
import { claim, forget, found } from './identity/index.js';
import { signIn, stored } from './sign-in/index.js';
import {
  checkAt,
  cloudflaredInstalled,
  installCloudflared,
  openTunnel,
} from './tunnel/index.js';

/*
 * This Connect as a Machine: signed in to Cloud Connect as one User, the
 * one Machine its machine.json is, reachable through a tunnel, and
 * reporting itself on every Heartbeat until it is forgotten or told to stop.
 *
 * `identify` comes first, since the server needs the Machine Key before it
 * listens; `online` then opens the tunnel and beats; `logout` undoes both.
 */

/** Wait before signing in again once a new Sign-in was refused too; it doubles after, up to a minute. */
const FIRST_BACKOFF = '1 second';

/** The Machine cannot go on serving; `message` says why and what to do. */
export class MachineStopped extends Data.TaggedError('MachineStopped')<{
  readonly message: string;
}> {}

interface Where {
  /** Cloud Connect's base URL. */
  readonly cloud: string;
  /** The SQLite database file, which keeps the Sign-in. */
  readonly db: string;
  /** The Machine's machine.json. */
  readonly machineFile: string;
  /** This Connect's version. */
  readonly version: string;
}

/**
 * Signs in and finds which Machine this is, making it on the first run,
 * for as long as the Scope: the Machine (its id, name and key) and the
 * User. `name` renames the Machine; `firstName` names a new one.
 */
export const identify = (
  options: Where & {
    readonly name?: string | undefined;
    readonly firstName?: string | undefined;
  },
) =>
  Effect.gen(function* () {
    const session = yield* signIn(options);
    const owner = { id: session.user.id, email: session.user.email };
    const machine = yield* claim({
      file: options.machineFile,
      db: options.db,
      owner,
      name: options.name,
      firstName: options.firstName,
    });
    return { ...options, machine, user: session.user, session };
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
    case 'MachineForgotten':
      return { _tag: 'Forgotten' } as const;
    case 'Unauthenticated':
      return { _tag: 'SignedOut' } as const;
    case 'MachineTaken':
      return {
        _tag: 'Refused',
        reason:
          'Another User holds this Machine id. Run `ke-connect logout` to start as a new Machine.',
      } as const;
    default:
      return {
        _tag: 'Unsent',
        problem: error instanceof Error ? error.message : String(tag ?? error),
      } as const;
  }
};

/**
 * Puts the identified Machine online, the server already listening on
 * `port`: a tunnel to it through the cloudflared at `cloudflared`
 * (downloaded there when missing), and a Heartbeat every `every` seconds
 * reporting it to Cloud Connect. Runs until the Machine is forgotten (it
 * signs out first) or must stop, failing MachineStopped with why.
 */
export const online = (
  identified: Identified,
  options: {
    readonly port: number;
    readonly every: number;
    readonly cloudflared: string;
  },
) =>
  Effect.gen(function* () {
    const { machine, session, cloud, version } = identified;
    const client = yield* clientAt(cloud, session.signing);
    const report = (status: MachineStatus) =>
      client.Report({ ...machine, version, status }).pipe(
        Effect.as({ _tag: 'Reported' } as const),
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
              `Signed in as ${user.email}, but this Machine is ${identified.user.email}'s. Run with another --branch.`,
            ),
      ),
    );

    const ended = yield* heartbeat({
      every: `${options.every} seconds`,
      installed: cloudflaredInstalled(options.cloudflared),
      install: installCloudflared(options.cloudflared),
      open: openTunnel(options.port, options.cloudflared),
      check: checkAt,
      report,
      backoff: FIRST_BACKOFF,
      signInAgain,
    });
    if (ended._tag === 'Forgotten') {
      yield* session.signOut;
      return yield* new MachineStopped({
        message: `${machine.name} was forgotten from the app, so it signed out and stopped. Run \`ke-connect logout\` to forget it here too, then serve again as a new Machine.`,
      });
    }
    return yield* new MachineStopped({
      message: ended._tag === 'Stopped' ? ended.reason : 'Stopped',
    });
  });

/**
 * Asks Cloud Connect to forget the Machine, signs out, revoking the
 * Sign-in, and forgets the Machine here, keeping its Projects and
 * Sessions: the next start is a new Machine. A Cloud Connect that cannot
 * be told is only logged: the Sign-in revoked, it can never Report again.
 */
export const logout = (options: Where) =>
  Effect.scoped(
    Effect.gen(function* () {
      const kept = { file: options.machineFile, db: options.db };
      const machine = yield* found(kept);
      const session = yield* stored(options);
      if (machine !== null && session.signing !== null) {
        const client = yield* clientAt(options.cloud, session.signing);
        yield* client
          .Forget({ id: machine.id })
          .pipe(
            Effect.catch((error) =>
              Effect.logWarning(
                `${options.cloud} could not be told to forget ${machine.name}; Forget it from the app`,
                error,
              ),
            ),
          );
      }
      yield* session.signOut;
      yield* forget(kept);
    }),
  );
