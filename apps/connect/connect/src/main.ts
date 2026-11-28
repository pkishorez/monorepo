import {
  appendFileSync,
  existsSync,
  readFileSync,
  rmSync,
  statSync,
  truncateSync,
} from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import {
  Console,
  Data,
  Effect,
  Layer,
  Logger,
  Option,
  Schedule,
  Stream,
} from 'effect';
import { DEFAULT_ORIGINS } from '@kestack/connect-cloud/app';
import { Connect, type Input, type Why } from './actor-connect/index.js';
import { attach, headless } from './devtools/index.js';
import {
  type Commands,
  OUTDATED_EXIT,
  run as runCommands,
  type ServeFlags,
} from './commands/index.js';
import {
  type ConnectionFolders,
  computerName,
  connectionFolders,
  connectionNames,
  createFolders,
  hostName,
} from './folders/index.js';
import * as CloudReal from './services/cloud/real/index.js';
import { Cloud } from './services/cloud/contract/index.js';
import * as CloudflaredReal from './services/cloudflared/real/index.js';
import { hold, reach } from './services/control/real/index.js';
import { Control } from './services/control/contract/index.js';
import { Downloads } from './services/downloads/contract/index.js';
import * as DownloadsReal from './services/downloads/real/index.js';
import * as LocksReal from './services/locks/real/index.js';
import * as PluginsReal from './services/plugins/real/index.js';
import * as ServerReal from './services/server/real/index.js';
import { SignIn } from './services/sign-in/contract/index.js';
import * as SignInReal from './services/sign-in/real/index.js';
import { Store } from './services/store/contract/index.js';
import * as StoreReal from './services/store/real/index.js';

const version = (
  JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { readonly version: string }
).version;

const MOST_LOG_BYTES = 10 * 1024 * 1024;
const UNUSED = '30 days';
const STOPPING = '30 seconds';
const ROTATE_KEY_EVERY = 60 * 60 * 1000;
const REACH_EVERY = 60 * 1000;
const FIRST_RETRY_AFTER = 1000;

class ConnectionStopped extends Data.TaggedError('ConnectionStopped')<{
  readonly message: string;
  readonly exitCode?: number;
}> {}

const logsTo = (file: string) =>
  Logger.layer(
    [
      Effect.sync(() => {
        if (existsSync(file) && statSync(file).size > MOST_LOG_BYTES)
          truncateSync(file, 0);
        return Logger.map(Logger.formatLogFmt, (line) =>
          appendFileSync(file, `${line}\n`, { mode: 0o600 }),
        );
      }),
    ],
    { mergeWithExisting: true },
  ) satisfies Layer.Layer<never>;

const accountLayer = (own: ConnectionFolders, cloud: string) => {
  const store = StoreReal.layer({
    db: own.db,
    backups: own.backups,
    version,
    host: hostname(),
    shortHost: hostName(),
  });
  const signIn = SignInReal.layer({ cloud, version }).pipe(
    Layer.provideMerge(store),
  );
  return CloudReal.layer({ cloud, version }).pipe(Layer.provideMerge(signIn));
};

const runningLayer = (own: ConnectionFolders) => {
  const locks = LocksReal.layer;
  const downloads = DownloadsReal.layer(own.cache).pipe(
    Layer.provideMerge(locks),
  );
  return Layer.mergeAll(
    ServerReal.layer,
    CloudflaredReal.layer,
    PluginsReal.layer,
  ).pipe(Layer.provideMerge(downloads));
};

const prune = Effect.flatMap(Downloads, (downloads) =>
  downloads.prune({
    olderThan: UNUSED,
    keep: [CloudflaredReal.CLOUDFLARED_KEY],
  }),
).pipe(
  Effect.flatMap((removed) =>
    removed.length === 0
      ? Effect.void
      : Effect.log(
          `Deleted downloads unused for ${UNUSED}: ${removed.join(', ')}`,
        ),
  ),
  Effect.catch((error) =>
    Effect.logWarning('Could not prune the downloads', error),
  ),
);

const stoppedBecause = (why: Why, name: string) =>
  Effect.gen(function* () {
    switch (why._tag) {
      case 'Removed':
        yield* Effect.flatMap(SignIn, (signIn) => signIn.signOut);
        return yield* new ConnectionStopped({
          message: `${name} was removed from the app, so it signed out and stopped. Run \`ke-connect remove ${name}\` to delete it here too, then serve again as a new Connection.`,
        });
      case 'Outdated':
        return yield* new ConnectionStopped({
          message: why.line,
          exitCode: OUTDATED_EXIT,
        });
      case 'Failed':
        return yield* new ConnectionStopped({ message: why.reason });
      case 'Requested':
        return yield* Effect.log(`${name} stopped`);
    }
  });

const foldersOf = (name: string) =>
  Effect.try({
    try: () => connectionFolders(name),
    catch: (cause) =>
      new ConnectionStopped({
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  });

const serve = (flags: ServeFlags) =>
  Effect.gen(function* () {
    const own = yield* foldersOf(flags.name);
    const held = yield* hold(own.control, flags.name).pipe(
      Effect.provide(LocksReal.layer),
      Effect.mapError(
        (error) =>
          new ConnectionStopped({
            message: `Could not hold the control socket: ${error.message}`,
          }),
      ),
    );
    if (held._tag === 'AlreadyRunning') {
      const url = yield* held.client.status().pipe(
        Effect.map((status) => status.url),
        Effect.catchTag('RpcClientError', () => Effect.succeed(null)),
      );
      return yield* Console.log(
        `${flags.name} is already running at ${url ?? 'no address yet'}`,
      );
    }
    createFolders([own.data, own.state, own.cache, own.socketFolder]);
    const serving = Effect.gen(function* () {
      yield* Effect.log(`ke-connect ${version}: ${flags.name}`);
      yield* Effect.log(`Data in ${own.data}`);
      const context = yield* Layer.build(
        Layer.mergeAll(
          accountLayer(own, flags.cloud),
          runningLayer(own),
          Layer.succeed(Control, held.control),
        ),
      );
      yield* prune.pipe(Effect.provideContext(context));
      const app = yield* headless(Connect, {
        name: 'ke-connect',
        input: {
          connection: {
            name: flags.name,
            computerName: computerName(flags.name),
            cloud: flags.cloud,
            version,
          },
          settings: {
            heartbeatEvery: flags.heartbeat * 1000,
            firstRetryAfter: FIRST_RETRY_AFTER,
            tunnel: {
              port: flags.port,
              origins: [...DEFAULT_ORIGINS, ...flags.origins],
              reachEvery: REACH_EVERY,
              rotateKeyEvery: ROTATE_KEY_EVERY,
            },
            pluginHome: {
              data: own.plugins,
              state: join(own.state, 'plugins'),
              cache: join(own.cache, 'plugins'),
              sockets: own.sockets,
            },
          },
        } satisfies Input,
        layer: Layer.succeedContext(context),
      });
      if (Option.isSome(flags.devtools)) {
        yield* attach(app, {
          url: flags.devtools.value,
          environment: hostName(),
          name: `ke-connect-${flags.name}`,
        });
        yield* Effect.log(
          `Shown in DevTools at ${flags.devtools.value}/kabuki`,
        );
      }
      const running = app.runtime;
      const root = () => running.root;
      const why = yield* running.changes.pipe(
        Stream.map(() => root()),
        Stream.merge(Stream.sync(root)),
        Stream.map(({ state }) => state),
        Stream.filter((state) => state._tag === 'Stopped'),
        Stream.runHead,
        Effect.map(Option.getOrThrow),
        Effect.map(({ why: stopped }) => stopped),
      );
      yield* stoppedBecause(why, flags.name).pipe(
        Effect.provideContext(context),
      );
    });
    yield* Effect.raceFirst(
      serving,
      held.stopping.pipe(Effect.andThen(Effect.log(`${flags.name} stopped`))),
    ).pipe(Effect.provide(logsTo(own.log)));
  }).pipe(Effect.scoped);

const statusOf = (own: ConnectionFolders) =>
  reach(own.control).pipe(
    Effect.flatMap((client) => client.status()),
    Effect.map((status) =>
      Option.some<{ readonly url: string | null }>(status),
    ),
    Effect.catchTag('RpcClientError', () => Effect.succeedSome({ url: null })),
    Effect.catchTag('NotRunning', () => Effect.succeedNone),
    Effect.scoped,
  );

const list = () =>
  Effect.gen(function* () {
    const names = connectionNames();
    if (names.length === 0)
      return yield* Console.log(
        'No Connections yet; `ke-connect serve` makes one.',
      );
    for (const name of names) {
      const own = yield* foldersOf(name);
      const running = yield* statusOf(own);
      const kept = yield* StoreReal.readConnection(own.db).pipe(
        Effect.orElseSucceed(() => null),
      );
      yield* Console.log(
        [
          name,
          Option.isSome(running) ? 'running' : 'stopped',
          Option.flatMap(running, ({ url }) => Option.fromNullishOr(url)).pipe(
            Option.getOrElse(() => '-'),
          ),
          kept === null ? '-' : new Date(kept.startedAt).toISOString(),
        ].join('\t'),
      );
    }
  });

const stopRunning = (own: ConnectionFolders) =>
  Effect.gen(function* () {
    yield* reach(own.control).pipe(
      Effect.flatMap((client) => client.stop()),
      Effect.ignore,
      Effect.scoped,
    );
    yield* statusOf(own).pipe(
      Effect.repeat({
        while: (running) => Option.isSome(running),
        schedule: Schedule.spaced('100 millis'),
      }),
      Effect.timeoutOrElse({
        duration: STOPPING,
        orElse: () =>
          Effect.fail(new Error(`${own.name} did not stop in ${STOPPING}`)),
      }),
    );
  });

const stop = (name: string) =>
  Effect.gen(function* () {
    const own = yield* foldersOf(name);
    if (Option.isNone(yield* statusOf(own)))
      return yield* Console.log(`${name} is not running`);
    yield* stopRunning(own);
    yield* Console.log(`Stopped ${name}`);
  });

const forgetEverywhere = (own: ConnectionFolders, cloud: string) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const kept = yield* store.connection;
    if (kept !== null)
      yield* Effect.flatMap(Cloud, (each) => each.remove(kept.id)).pipe(
        Effect.catch((error) =>
          Effect.logWarning(
            `Could not tell ${cloud} to remove ${own.name}; remove it from the app`,
            error,
          ),
        ),
      );
    yield* Effect.flatMap(SignIn, (signIn) => signIn.signOut);
    yield* store.forget;
  }).pipe(Effect.provide(accountLayer(own, cloud)), Effect.scoped);

const remove = (name: string, deleteData: boolean) =>
  Effect.gen(function* () {
    const own = yield* foldersOf(name);
    if (!existsSync(own.data) && !existsSync(own.state))
      return yield* Effect.fail(new Error(`There is no Connection ${name}`));
    if (Option.isSome(yield* statusOf(own))) {
      yield* Console.log(`Stopping ${name}`);
      yield* stopRunning(own);
    }
    const kept = yield* StoreReal.readConnection(own.db).pipe(
      Effect.orElseSucceed(() => null),
    );
    if (kept !== null)
      yield* forgetEverywhere(own, kept.cloud).pipe(
        Effect.catch((error) =>
          Effect.logWarning(`Could not sign ${name} out`, error),
        ),
      );
    const deleted = [
      own.db,
      `${own.db}-journal`,
      `${own.db}-wal`,
      `${own.db}-shm`,
      own.backups,
      own.state,
      own.socketFolder,
      ...(deleteData ? [own.data] : []),
    ];
    for (const path of deleted)
      if (path !== null) rmSync(path, { recursive: true, force: true });
    yield* Console.log(
      deleteData || !existsSync(own.plugins)
        ? `Removed ${name}`
        : `Removed ${name}; its Plugins' data is kept in ${own.plugins}`,
    );
  });

export const commands: Commands = { serve, list, stop, remove };

export const main = () => runCommands(commands, version);
