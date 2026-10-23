import { Context, Data, Effect, Layer } from 'effect';
import { MachinesClient } from './backend/client/index.js';
import type { TunnelCheck } from './backend/contract/index.js';
import { heartbeat } from './heartbeat.js';
import { claim, forget, found } from './identity/index.js';
import { signIn, stored } from './sign-in/index.js';
import { checkAt, openTunnel } from './tunnel/index.js';

/*
 * This server as a Machine: signed in to its Backend as one User, the one
 * Machine its database file is, reachable through a tunnel, and reporting
 * itself on every Heartbeat until it is forgotten or told to stop.
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
  /** The Machines Backend's base URL. */
  readonly backend: string;
  /** The SQLite database file: the Machine, its Sign-in and its records. */
  readonly db: string;
  /** This ai-toolkit's version. */
  readonly version: string;
}

/**
 * Signs in and finds which Machine the database file is, making it on the
 * first run, for as long as the Scope: the Machine (its id, name and key)
 * and the User. `as` is Local mode's User; `name` renames the Machine.
 */
export const identify = (
  options: Where & {
    readonly as?: string | undefined;
    readonly name?: string | undefined;
  },
) =>
  Effect.gen(function* () {
    const session = yield* signIn(options);
    const owner = { id: session.user.id, email: session.user.email };
    const machine = yield* claim({ db: options.db, owner, name: options.name });
    return { ...options, machine, user: session.user, session };
  });

type Identified = Effect.Success<ReturnType<typeof identify>>;

/** The Machines Backend at `backend`, its calls signed by `signing`, for as long as the Scope. */
const clientAt = (backend: string, signing: Layer.Layer<unknown>) =>
  Effect.map(
    Layer.build(MachinesClient.layer(backend).pipe(Layer.provide(signing))),
    (context) => Context.get(context, MachinesClient),
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
          'Another User holds this Machine id. Run `ai-toolkit logout` to start as a new Machine.',
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
 * `port`: a tunnel to it, and a Heartbeat every `every` reporting it to the
 * Backend. Runs until the Machine is forgotten (it signs out first) or must
 * stop, failing MachineStopped with why.
 */
export const online = (
  identified: Identified,
  options: { readonly port: number; readonly every: number },
) =>
  Effect.gen(function* () {
    const { machine, session, backend, version } = identified;
    const client = yield* clientAt(backend, session.signing);
    const report = (now: {
      readonly url: string | null;
      readonly tunnel: TunnelCheck | null;
    }) =>
      client
        .Report({ ...machine, version, url: now.url, tunnel: now.tunnel })
        .pipe(
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
              `Signed in as ${user.email}, but this Machine is ${identified.user.email}'s. Run with another --db.`,
            ),
      ),
    );

    const ended = yield* heartbeat({
      every: `${options.every} seconds`,
      open: openTunnel(options.port),
      check: checkAt,
      report,
      backoff: FIRST_BACKOFF,
      signInAgain,
    });
    if (ended._tag === 'Forgotten') {
      yield* session.signOut;
      return yield* new MachineStopped({
        message: `${machine.name} was forgotten from the app, so it signed out and stopped. Run \`ai-toolkit logout\` to forget it here too, then serve again as a new Machine.`,
      });
    }
    return yield* new MachineStopped({
      message: ended._tag === 'Stopped' ? ended.reason : 'Stopped',
    });
  });

/**
 * Asks the Backend to forget the Machine, signs out, revoking the
 * Sign-in, and forgets the Machine here, keeping its Projects and
 * Sessions: the next start is a new Machine. A Backend that cannot be
 * told is only logged: the Sign-in revoked, it can never Report again.
 */
export const logout = (options: Where) =>
  Effect.scoped(
    Effect.gen(function* () {
      const machine = yield* found(options.db);
      // In Local mode the Machine's owner is who it signed in as.
      const session = yield* stored({ ...options, as: machine?.owner.email });
      if (machine !== null && session.signing !== null) {
        const client = yield* clientAt(options.backend, session.signing);
        yield* client
          .Forget({ id: machine.id })
          .pipe(
            Effect.catch((error) =>
              Effect.logWarning(
                `${options.backend} could not be told to forget ${machine.name}; Forget it from the app`,
                error,
              ),
            ),
          );
      }
      yield* session.signOut;
      yield* forget(options.db);
    }),
  );
