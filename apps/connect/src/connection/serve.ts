import { chmodSync, existsSync } from 'node:fs';
import { Effect, Layer, Option, Stream } from 'effect';
import { History, Runtime } from '@kestack/kabuki';
import { Downloads } from '@kestack/cli-platform/files';
import { ActorConnection, ConnectionHost } from './actor-connection/index.js';
import type { ConnectionFolders } from './folders.js';
import {
  checkAt,
  cloud,
  cloudflared,
  type identify,
  openTunnel,
} from './online/index.js';

/*
 * Running a signed-in Connection: its Actor tree, standing on the tunnel
 * and Cloud Connect `online/` gives, until it ends, Forgotten or Stopped.
 */

/** Wait before signing in again once a new Sign-in was refused too; it doubles after, up to a minute. */
const FIRST_BACKOFF = '1 second';

/** Keeps the database 0600 once it is there. */
export const ownDb = (db: string) =>
  Effect.sync(() => {
    if (existsSync(db)) chmodSync(db, 0o600);
  });

export interface RunOptions {
  readonly own: ConnectionFolders;
  readonly identified: Effect.Success<ReturnType<typeof identify>>;
  readonly port: number;
  readonly origins: ReadonlyArray<string>;
  readonly heartbeat: number;
  readonly plugins: Readonly<Record<string, string>>;
  /** Called once the router listens, with its port. */
  readonly onListening?: (port: number) => Effect.Effect<void>;
}

/**
 * Runs the identified Connection until it ends, for as long as the Scope:
 * how it ended. A Connection forgotten has signed out first.
 */
export const run = (options: RunOptions) =>
  Effect.gen(function* () {
    const { own, identified } = options;
    const calls = yield* cloud(identified);
    const downloads = Downloads.layer(own.cache);
    const host = ConnectionHost.of({
      every: `${options.heartbeat} seconds`,
      cloudflared: Effect.provide(cloudflared, downloads),
      open: openTunnel,
      check: checkAt,
      report: calls.report,
      backoff: FIRST_BACKOFF,
      signInAgain: calls.signInAgain,
    });
    const running = yield* Runtime.start(
      History.make(ActorConnection, {
        window: 0,
        input: {
          id: identified.connection.id,
          name: own.name,
          key: identified.connection.key,
          folders: {
            data: own.data,
            state: own.state,
            cache: own.cache,
            runtime: own.runtime,
          },
          socketId: own.socketId,
          control: own.control,
          port: options.port,
          origins: options.origins,
          files: options.plugins,
        },
      }),
      Layer.merge(Layer.succeed(ConnectionHost, host), downloads),
    );
    const root = () => running.instance({ from: 'serve' });
    const states = running.changes.pipe(
      Stream.map(() => root()),
      Stream.merge(Stream.sync(root)),
    );
    yield* states.pipe(
      Stream.map(({ model }) => model.listening),
      Stream.filter((port): port is number => port !== null),
      Stream.runHead,
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.void,
          onSome: (port) =>
            Effect.log(`listening on 127.0.0.1:${port}`).pipe(
              Effect.andThen(options.onListening?.(port) ?? Effect.void),
            ),
        }),
      ),
      Effect.forkScoped,
    );
    const ended = yield* states.pipe(
      Stream.map(({ state }) => state),
      Stream.filter(
        (state) => state._tag === 'Forgotten' || state._tag === 'Stopped',
      ),
      Stream.runHead,
      Effect.map(Option.getOrThrow),
    );
    if (ended._tag === 'Forgotten') yield* calls.signOut;
    return ended;
  });
