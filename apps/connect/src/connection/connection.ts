import {
  appendFileSync,
  existsSync,
  readFileSync,
  statSync,
  truncateSync,
} from 'node:fs';
import { Console, Data, Effect, Layer, Logger, Option, Schedule } from 'effect';
import { createFolders } from '@kestack/cli-platform/files';
import { reach } from '@kestack/cli-platform/single';
import {
  ConnectionControl,
  run,
  type RunningConnection,
} from './actor-connection/index.js';
import { run as runCli, type ServeFlags } from './cli/index.js';
import {
  belongsTo,
  type ConnectionFolders,
  connectionFolders,
  connectionNames,
  deleteFolders,
  forget,
  hostName,
  identify,
  kept,
} from './identity/index.js';

/*
 * `ke-connect`: the Connections on this computer. cli/ is its commands;
 * each is done here.
 *
 * - serve: a Connection already running is only reported. Else it signs
 *   in as the Connection its folder keeps, through identity/, and runs the
 *   Connection's Actor tree, actor-connection/, until it is forgotten,
 *   refused or stopped. A Connection forgotten signs out first.
 * - list: every Connection with a folder, asking each that runs about
 *   itself on its control socket.
 * - remove: stops it if it runs, forgets it in Cloud Connect, signs out
 *   and deletes its folders.
 *
 * A Connection keeps its files where identity/ says. `serve` logs to the
 * console and to a file, so a Connect started by a dev script or in the
 * background can still be read afterwards. The file is only ever appended
 * to; a file grown past 10 MB is emptied when `serve` starts, rather than
 * rotated.
 */

/** This Connect's version, as it reports itself. */
const version = (
  JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { readonly version: string }
).version;

/** This computer, and every App on the stack's domains, deployed or as Portless serves it in development. */
const DEFAULT_ORIGINS: ReadonlyArray<string> = [
  'http://localhost:*',
  'http://127.0.0.1:*',
  'http://[::1]:*',
  'https://localhost:*',
  'https://*.localhost:*',
  'https://*.kishore.app',
  'https://*.kishore.computer',
];

/** The largest the log may be when `serve` starts before it is emptied. */
const MOST_BYTES = 10 * 1024 * 1024;

/** Every log line also appended to `file`, 0600, emptied first when it is over 10 MB. */
const logsTo = (file: string) =>
  Logger.layer(
    [
      Effect.sync(() => {
        if (existsSync(file) && statSync(file).size > MOST_BYTES)
          truncateSync(file, 0);
        return Logger.map(Logger.formatLogFmt, (line) =>
          appendFileSync(file, `${line}\n`, { mode: 0o600 }),
        );
      }),
    ],
    { mergeWithExisting: true },
  ) satisfies Layer.Layer<never>;

/** The Connection cannot go on serving; `message` says why and what to do. */
class ConnectionStopped extends Data.TaggedError('ConnectionStopped')<{
  readonly message: string;
}> {}

/** How long `remove` waits for a running Connection to stop. */
const STOPPING = '30 seconds';

/** What the running Connection of `own` says of itself; None when none runs. */
const runningOf = (
  own: ConnectionFolders,
): Effect.Effect<Option.Option<Pick<RunningConnection, 'url'>>, unknown> =>
  reach(own.control, ConnectionControl).pipe(
    Effect.flatMap((client) => client.status()),
    Effect.map((running) =>
      Option.some<Pick<RunningConnection, 'url'>>(running),
    ),
    // It holds the socket, but cannot say more.
    Effect.catchTag('RpcClientError', () => Effect.succeedSome({ url: null })),
    Effect.catchTag('NotRunning', () => Effect.succeedNone),
    Effect.scoped,
  );

/**
 * Runs the Connection `name` until it is stopped, or must stop: signed in,
 * tunnelled, running its Plugins and reporting its Heartbeat. One already
 * running is reported instead. It logs to the console and to its state
 * folder.
 */
const serve = (options: ServeFlags) =>
  Effect.gen(function* () {
    const own = yield* connectionFolders(options.name);
    const running = yield* runningOf(own);
    if (Option.isSome(running))
      return yield* Console.log(
        `${options.name} is already running at ${running.value.url ?? 'no address yet'}`,
      );
    yield* createFolders({
      data: own.data,
      state: own.state,
      cache: own.cache,
      runtime: own.runtime,
    });
    yield* Effect.gen(function* () {
      yield* belongsTo(own.connectionFile, options.cloud);
      const identified = yield* identify({
        cloud: options.cloud,
        db: own.db,
        connectionFile: own.connectionFile,
        version,
        firstName:
          options.name === 'main'
            ? hostName()
            : `${hostName()} (${options.name})`,
        startedAt: Date.now(),
      });
      const { connection, user } = identified;
      yield* Effect.log(`ke-connect ${version}: ${options.name}`);
      yield* Effect.log(`data in ${own.data}`);
      yield* Effect.log(`Connection ${connection.name} (${connection.id})`);
      yield* Effect.log(`signed in as ${user.email} to ${options.cloud}`);

      const ended = yield* run({
        input: {
          id: connection.id,
          name: own.name,
          key: connection.key,
          folders: {
            data: own.data,
            state: own.state,
            cache: own.cache,
            runtime: own.runtime,
          },
          socketId: own.socketId,
          control: own.control,
          port: options.port,
          origins: [...DEFAULT_ORIGINS, ...options.origins],
        },
        cloud: {
          client: identified.client,
          connection,
          version,
          user,
          signInAgain: identified.session.signInAgain,
          heartbeat: options.heartbeat,
        },
      });
      if (ended._tag === 'Forgotten') yield* identified.session.signOut;
      if (ended._tag === 'Forgotten')
        return yield* new ConnectionStopped({
          message: `${connection.name} was forgotten from the app, so it signed out and stopped. Run \`ke-connect remove ${options.name}\` to delete it here too, then serve again as a new Connection.`,
        });
      if (ended.reason !== null)
        return yield* new ConnectionStopped({ message: ended.reason });
      yield* Effect.log(`${options.name} stopped`);
    }).pipe(Effect.provide(logsTo(own.log)));
  }).pipe(Effect.scoped);

/** Prints every Connection on this computer: its name, whether it runs, its address and when it last started. */
const list = () =>
  Effect.gen(function* () {
    const names = yield* connectionNames();
    if (names.length === 0)
      return yield* Console.log(
        'No Connections yet; `ke-connect serve` makes one.',
      );
    for (const name of names) {
      const own = yield* connectionFolders(name);
      const running = yield* runningOf(own);
      const record = yield* kept(own.connectionFile).pipe(
        Effect.orElseSucceed(() => null),
      );
      yield* Console.log(
        [
          name,
          Option.isSome(running) ? 'running' : 'stopped',
          Option.flatMap(running, ({ url }) => Option.fromNullishOr(url)).pipe(
            Option.getOrElse(() => '-'),
          ),
          record === null ? '-' : new Date(record.startedAt).toISOString(),
        ].join('\t'),
      );
    }
  });

/**
 * Stops the Connection `name` if it runs, forgets it in Cloud Connect,
 * signs it out and deletes its folders. A Cloud Connect that cannot be
 * told is only warned of.
 */
const remove = (name: string) =>
  Effect.gen(function* () {
    const own = yield* connectionFolders(name);
    if (!existsSync(own.data) && !existsSync(own.state))
      return yield* Effect.fail(new Error(`There is no Connection ${name}`));
    if (Option.isSome(yield* runningOf(own))) {
      yield* Console.log(`Stopping ${name}`);
      yield* reach(own.control, ConnectionControl).pipe(
        Effect.flatMap((client) => client.stop()),
        Effect.ignore,
        Effect.scoped,
      );
      yield* runningOf(own).pipe(
        Effect.repeat({
          while: (running) => Option.isSome(running),
          schedule: Schedule.spaced('100 millis'),
        }),
        Effect.timeoutOrElse({
          duration: STOPPING,
          orElse: () =>
            Effect.fail(new Error(`${name} did not stop in ${STOPPING}`)),
        }),
      );
    }
    const record = yield* kept(own.connectionFile).pipe(
      Effect.orElseSucceed(() => null),
    );
    if (record !== null)
      yield* forget({
        cloud: record.cloud,
        db: own.db,
        connectionFile: own.connectionFile,
        version,
      }).pipe(
        Effect.catch((error) =>
          Effect.logWarning(
            `Could not sign ${name} out of ${record.cloud}; Forget it from the app`,
            error,
          ),
        ),
      );
    yield* deleteFolders(own);
    yield* Console.log(`Removed ${name}`);
  });

/** Runs `ke-connect` on this process's arguments, until it ends. */
export const main = () => runCli({ serve, list, remove }, version);
