import { dirname, join } from 'node:path';
import { Duration, Effect, Queue, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import {
  type CacheError,
  type DownloadFailed,
  Downloads,
  type HashMismatch,
} from '../../files/downloads/index.js';
import { Plugins, type PluginState } from '../contract/index.js';
import { child, LOG_LINES, previousGone, socketFree } from './child.js';

/*
 * Keeps one Plugin running at the version its parent wants: a sha256 and
 * where to download it, `file:` for a folder a build puts each file in, or
 * a file on this computer in development. While
 * there is nothing to run yet it is Fetching. Running, one process runs
 * per file, keyed by it: a new file is a fresh process, and the old one is
 * stopped first, so the key changing is the swap. A new version downloads
 * while the old one runs; the new process starts only once the old one has
 * exited, its finalizers done or it killed. A process that exits goes Crashed, and is tried
 * again after a pause that doubles each time, up to a minute; one that ran
 * a minute or more before it exited starts the count over. Every change in
 * where it stands is reported up through Plugins. While a downloaded file
 * is what runs, it is marked used every day, so a prune by this or another
 * CLI never deletes it.
 */

/** How long a Plugin must run before its crashes no longer count. */
const STEADY = Duration.minutes(1);

/** How often the downloaded file running is marked used: well inside any prune's age. */
const MARK_EVERY = Duration.hours(24);

const Folders = Schema.Struct({
  data: Schema.String,
  state: Schema.String,
  cache: Schema.String,
  shared: Schema.String,
});

/** The first pause before trying again, and the longest, in ms. */
const Pause = Schema.Struct({ first: Schema.Finite, most: Schema.Finite });

const DEFAULT_PAUSE = { first: 1_000, most: 60_000 };

/** Which Plugin to run: a download, by its sha256, or a local file. */
const Wanted = Schema.Union([
  Schema.Struct({ hash: Schema.String, url: Schema.String }),
  Schema.Struct({ file: Schema.String }),
]);
type Wanted = typeof Wanted.Type;

const Input = Schema.Struct({
  name: Schema.String,
  folders: Folders,
  /** The socket the Plugin listens on. */
  socket: Schema.String,
  /** How long to pause before trying again; 1 s doubling to 60 s unless given. */
  pause: Schema.optional(Pause),
});

const Props = Schema.Struct({ wanted: Wanted });

const Progress = Schema.Struct({
  received: Schema.Finite,
  total: Schema.NullOr(Schema.Finite),
});

const Model = Schema.Struct({
  name: Schema.String,
  folders: Folders,
  socket: Schema.String,
  pause: Pause,
  /** What runs: its key, the hash or local file, the file Node runs, and whether Downloads keeps it. */
  target: Schema.NullOr(
    Schema.Struct({
      key: Schema.String,
      file: Schema.String,
      downloaded: Schema.Boolean,
    }),
  ),
  /** Whether the process running says it listens. */
  ready: Schema.Boolean,
  /** When the process running said so, in the app's Time. */
  readyAt: Schema.NullOr(Schema.Finite),
  /** How far the download wanted is. */
  progress: Schema.NullOr(Progress),
  /** Crashes in a row. */
  crashes: Schema.Finite,
  /** Failed downloads of the version wanted, in a row. */
  fetchFailures: Schema.Finite,
  /** The last lines the Plugin printed. */
  log: Schema.Array(Schema.String),
});
type Model = typeof Model.Type;

const State = Schema.TaggedUnion({
  Fetching: {},
  Running: {},
  Crashed: {
    /** When to try again, in the app's Time. */
    retryAt: Schema.Finite,
    log: Schema.Array(Schema.String),
  },
});
type State = typeof State.Type;

const Message = Schema.TaggedUnion({
  Progressed: {
    key: Schema.String,
    received: Schema.Finite,
    total: Schema.NullOr(Schema.Finite),
  },
  Downloaded: { key: Schema.String, file: Schema.String },
  DownloadFailed: { key: Schema.String, reason: Schema.String },
  Started: { key: Schema.String },
  Logged: { key: Schema.String, lines: Schema.Array(Schema.String) },
  Exited: {
    key: Schema.String,
    code: Schema.NullOr(Schema.Finite),
    log: Schema.Array(Schema.String),
  },
  Retry: {},
});
type Message = typeof Message.Type;

type PluginSelf = Actor.Self<Model, State, Message, typeof Props.Type>;

/** The key of what is wanted: the hash, or the local file. */
const keyOf = (wanted: Wanted) =>
  'hash' in wanted ? wanted.hash.toLowerCase() : wanted.file;

/** The pause after `failures` failures in a row: `first`, doubling, up to `most`. */
const pauseAfter = ({ first, most }: typeof Pause.Type, failures: number) =>
  Math.min(first * 2 ** Math.max(0, failures - 1), most);

const tail = (log: ReadonlyArray<string>, lines: ReadonlyArray<string>) =>
  [...log, ...lines].slice(-LOG_LINES);

/** Why fetching the Plugin `name` at `hash` failed, as its log says it. */
const whyFailed = (
  name: string,
  hash: string,
  error: DownloadFailed | HashMismatch | CacheError,
) => {
  switch (error._tag) {
    case 'HashMismatch':
      return `${error.url} is not the Plugin asked for: its sha256 is ${error.actual}`;
    case 'DownloadFailed':
      // A `file:` URL is a folder a build puts each file in.
      return error.missing
        ? `${name} ${hash} isn't on the shelf; run the build`
        : `Could not download ${error.url}: ${error.message}`;
    case 'CacheError':
      return `Could not download ${error.path}: ${error.message}`;
  }
};

/** Downloads what is wanted, or takes the local file, and Sends Downloaded. */
const fetchWanted = (self: PluginSelf, key: string) =>
  Effect.gen(function* () {
    const { model, props } = yield* self.get;
    const wanted = props.wanted;
    if (keyOf(wanted) !== key) return;
    if (!('hash' in wanted))
      return yield* self.send({ _tag: 'Downloaded', key, file: wanted.file });
    // A new version that failed to download, while the old one runs.
    if (model.target !== null && model.fetchFailures > 0)
      yield* Effect.sleep(pauseAfter(model.pause, model.fetchFailures));
    const downloads = yield* Downloads;
    let told = 0;
    const fetched = yield* Effect.result(
      downloads.fetch(
        { url: wanted.url, sha256: key, name: 'plugin.mjs' },
        ({ received, total }) =>
          Effect.suspend(() => {
            const now = Date.now();
            if (received !== total && now - told < 100) return Effect.void;
            told = now;
            return self.send({ _tag: 'Progressed', key, received, total });
          }),
      ),
    );
    if (fetched._tag === 'Success')
      return yield* self.send({
        _tag: 'Downloaded',
        key,
        file: fetched.success,
      });
    yield* self.send({
      _tag: 'DownloadFailed',
      key,
      reason: whyFailed(model.name, key, fetched.failure),
    });
  });

/** Marks the downloaded file `key` used, now and every day after, for as long as it runs. */
const keepUsed = (key: string) =>
  Effect.flatMap(Downloads, (downloads) =>
    downloads
      .use(key)
      .pipe(
        Effect.ignore,
        Effect.andThen(Effect.sleep(MARK_EVERY)),
        Effect.forever,
      ),
  );

/** Runs the Plugin's process for `key`, Sending what happens to it, until it exits. */
const runProcess = (self: PluginSelf, key: string) =>
  Effect.gen(function* () {
    const { model } = yield* self.get;
    const target = model.target;
    if (target === null || target.key !== key) return;
    // The process before it was only told to stop: it may still be in its
    // finalizers, with the folders, after it left the socket.
    if (!(yield* previousGone(model.socket)))
      return yield* self.send({
        _tag: 'Exited',
        key,
        code: null,
        log: [`The ${model.name} Plugin before it did not exit`],
      });
    if (!(yield* socketFree(model.socket)))
      return yield* self.send({
        _tag: 'Exited',
        key,
        code: null,
        log: [`${model.socket} is still in use by another process`],
      });
    const events = yield* child({
      name: model.name,
      file: target.file,
      socket: model.socket,
      folders: model.folders,
      logFile: join(dirname(model.folders.state), `${model.name}.log`),
    });
    let log: ReadonlyArray<string> = [];
    while (true) {
      const event = yield* Queue.take(events);
      switch (event._tag) {
        case 'Lines':
          log = tail(log, event.lines);
          yield* self.send({ _tag: 'Logged', key, lines: [...event.lines] });
          break;
        case 'Ready':
          yield* self.send({ _tag: 'Started', key });
          break;
        case 'Exit':
          return yield* self.send({
            _tag: 'Exited',
            key,
            code: event.code,
            log,
          });
      }
    }
  }).pipe(Effect.scoped);

/** Where the Plugin stands, as reported up; `retryAt` in epoch ms. */
const stateOf = (
  {
    model,
    state,
    props,
  }: { model: Model; state: State; props: typeof Props.Type },
  now: number,
): PluginState => {
  const hash = model.target?.key ?? keyOf(props.wanted);
  switch (state._tag) {
    case 'Fetching':
      return {
        _tag: 'Downloading',
        hash,
        received: model.progress?.received ?? 0,
        total: model.progress?.total ?? null,
      };
    case 'Running':
      return { _tag: model.ready ? 'Running' : 'Starting', hash };
    case 'Crashed':
      return {
        _tag: 'Crashed',
        hash,
        log: state.log,
        retryAt: Date.now() + Math.max(0, state.retryAt - now),
      };
  }
};

/** Reports every change in where the Plugin stands, through Plugins. */
const report = (self: PluginSelf) =>
  Effect.gen(function* () {
    const plugins = yield* Plugins;
    const { model } = yield* self.get;
    yield* self.changes.pipe(
      Stream.mapEffect((data) =>
        Effect.map(self.now, (now) => stateOf(data, now)),
      ),
      Stream.changesWith(
        (a, b) =>
          a._tag === b._tag &&
          JSON.stringify({ ...a, retryAt: 0 }) ===
            JSON.stringify({ ...b, retryAt: 0 }),
      ),
      Stream.runForEach((state) => plugins.report(model.name, state)),
    );
  });

export const ActorPlugin = Actor.build(
  Actor.define('Plugin', {
    requires: [Downloads, Plugins],
    input: Input,
    props: Props,
    model: Model,
    state: State,
    message: Message,
  }),
  {
    init: ({ name, folders, socket, pause }) => ({
      model: {
        name,
        folders,
        socket,
        pause: pause ?? DEFAULT_PAUSE,
        target: null,
        ready: false,
        readyAt: null,
        progress: null,
        crashes: 0,
        fetchFailures: 0,
        log: [],
      },
      state: { _tag: 'Fetching' },
    }),
    on: {
      Progressed: ({ key, received, total }, { model, props }) =>
        key === keyOf(props.wanted)
          ? { model: { ...model, progress: { received, total } } }
          : {},
      Downloaded: ({ key, file }, { model, props }) =>
        key === keyOf(props.wanted)
          ? {
              model: {
                ...model,
                target: { key, file, downloaded: 'hash' in props.wanted },
                ready: false,
                readyAt: null,
                progress: null,
                crashes: 0,
                fetchFailures: 0,
              },
              state: { _tag: 'Running' },
            }
          : {},
      DownloadFailed: ({ key, reason }, { model, state, props, at }) => {
        if (key !== keyOf(props.wanted)) return {};
        const failed = {
          ...model,
          progress: null,
          fetchFailures: model.fetchFailures + 1,
          log: tail(model.log, [reason]),
        };
        // With a version running it keeps running, and the download is
        // tried again after a pause; with none, it is Crashed.
        return model.target === null && state._tag === 'Fetching'
          ? {
              model: failed,
              state: {
                _tag: 'Crashed',
                retryAt: at + pauseAfter(model.pause, failed.fetchFailures),
                log: failed.log,
              },
            }
          : { model: failed };
      },
    },
    workers: {
      download: {
        each: ({ model, state, props }) => {
          const key = keyOf(props.wanted);
          if (key === model.target?.key) return [];
          if (state._tag === 'Crashed' && model.target === null) return [];
          return [`${model.fetchFailures}:${key}`];
        },
        run: (self, each) =>
          fetchWanted(self, each.slice(each.indexOf(':') + 1)),
      },
      report: { run: report },
      keep: {
        each: ({ model }) =>
          model.target?.downloaded === true ? [model.target.key] : [],
        run: (_, key) => keepUsed(key),
      },
    },
    state: {
      Fetching: {},
      Running: {
        on: {
          Logged: ({ key, lines }, { model }) =>
            key === model.target?.key
              ? { model: { ...model, log: tail(model.log, lines) } }
              : {},
          Started: ({ key }, { model, at }) =>
            key === model.target?.key
              ? { model: { ...model, ready: true, readyAt: at } }
              : {},
          Exited: ({ key, log }, { model, at }) => {
            if (key !== model.target?.key) return {};
            const steady =
              model.readyAt !== null &&
              at - model.readyAt >= Duration.toMillis(STEADY);
            const crashes = steady ? 1 : model.crashes + 1;
            return {
              model: { ...model, ready: false, readyAt: null, crashes },
              state: {
                _tag: 'Crashed',
                retryAt: at + pauseAfter(model.pause, crashes),
                log: log.length > 0 ? log : model.log,
              },
            };
          },
        },
        workers: {
          process: {
            each: ({ model }) =>
              model.target === null ? [] : [model.target.key],
            run: runProcess,
          },
        },
      },
      Crashed: {
        on: {
          Retry: (_, { model }) => ({
            state:
              model.target === null
                ? { _tag: 'Fetching' }
                : { _tag: 'Running' },
          }),
        },
        workers: {
          retry: {
            run: (self) =>
              Effect.gen(function* () {
                const { state } = yield* self.get;
                const now = yield* self.now;
                yield* Effect.sleep(Math.max(0, state.retryAt - now));
                yield* self.send({ _tag: 'Retry' });
              }),
          },
        },
      },
    },
  },
);
