import {
  Clock,
  Duration,
  Effect,
  Fiber,
  Layer,
  Option,
  Schedule,
  Schema,
  Stream,
} from 'effect';
import { Actor, type Self } from '@kestack/kabuki';
import {
  pluginFolders,
  socketPath,
  type Folders,
} from '@kestack/cli-platform/files';
import {
  ActorPlugin,
  Plugins,
  PluginState,
} from '@kestack/cli-platform/plugins';
import { single } from '@kestack/cli-platform/single';
import {
  addressOf,
  ConnectionStatus,
  TunnelCheck,
} from '../../cloud/contract/index.js';
import { ConnectionHost } from './capabilities/index.js';
import { ConnectionControl } from './control.js';
import { router } from './router.js';

/*
 * One running Connection. Always, the router Worker listens on the
 * Connection's public port and passes `/<plugin>/…` to each Plugin's
 * socket, and the control Worker holds the Connection's control socket, the
 * lock that makes it the one process of its name. One ActorPlugin Child per
 * Plugin wanted keeps it running at that version, and reports where it
 * stands up through Plugins.
 *
 * While Online, the tunnel Worker keeps a tunnel to the router's port open,
 * keyed by its generation, so a new generation is a restarted tunnel;
 * another beats on a fixed interval: it checks the tunnel, then Reports to
 * Cloud Connect how the tunnel and each Plugin stand. Each Report carries
 * the Connection Status: the tunnel Installing cloudflared, Opening, failed
 * to open, or up and how its last check went. A change the app waits on, a
 * download begun or a tunnel up or failed, is Reported at once. Three
 * failed checks in a row start a new generation. Cloud Connect answers a
 * Report with the version of each Plugin to run: a Plugin named is started,
 * a new version swaps it; one no longer named keeps running. A Plugin given
 * as a file, in development, stays that file. A revoked Sign-in takes it to
 * SigningIn, which closes the tunnel until signed in again, while the
 * Plugins run on; a forgotten or refused Connection ends it, and so does
 * `stop` on the control socket.
 *
 * A Cloud Connect that refuses Sign-in after Sign-in would have it sign in
 * and open a tunnel over and over: from the second refusal in a row it
 * waits before signing in again, twice as long each time, up to a minute.
 * A Report taken ends the run.
 */

/** Failed Tunnel Checks in a row before the tunnel is restarted. */
const FAILURES_BEFORE_RESTART = 3;

/** How long to wait before opening a tunnel again after one failed to open. */
const REOPEN_AFTER = Duration.seconds(5);

/** How long getting cloudflared may take before the Connection says it is Installing. */
const INSTALLING_AFTER = Duration.millis(500);

/** The longest wait before signing in again. */
const MOST_BACKOFF = Duration.minutes(1);

/** A Plugin's name: what a folder and a socket can be named. */
const PLUGIN_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * How long to wait before signing in again after `refusals` Sign-ins in a
 * row were refused: none after the first, then `first`, doubling, up to a
 * minute.
 */
const backoffAfter = (refusals: number, first: Duration.Input) =>
  refusals <= 1
    ? Duration.zero
    : Duration.min(
        Duration.times(Duration.fromInputUnsafe(first), 2 ** (refusals - 2)),
        MOST_BACKOFF,
      );

const FoldersSchema = Schema.Struct({
  data: Schema.String,
  state: Schema.String,
  cache: Schema.String,
  runtime: Schema.String,
});

const Version = Schema.Struct({ hash: Schema.String, url: Schema.String });

/** Which Plugin to run, as ActorPlugin takes it: a download, or a local file. */
const Wanted = Schema.Union([Version, Schema.Struct({ file: Schema.String })]);

const Input = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  /** The Connection Key. */
  key: Schema.String,
  folders: FoldersSchema,
  /** What names its Plugins' sockets: their paths take its first 8 characters. */
  socketId: Schema.String,
  /** Its control socket, the lock that makes it the one process of its name. */
  control: Schema.String,
  /** The public port to listen on; 0 for any free one. */
  port: Schema.Finite,
  /** The origins a browser page may call from. */
  origins: Schema.Array(Schema.String),
  /** In development: a Plugin to run from a file, by name, whatever Cloud Connect wants. */
  files: Schema.Record(Schema.String, Schema.String),
});
type Input = typeof Input.Type;

const Model = Schema.Struct({
  ...Input.fields,
  /** The port the router listens on; null until it does. */
  listening: Schema.NullOr(Schema.Finite),
  /** Which tunnel this is; a new one is a restart. */
  generation: Schema.Number,
  status: ConnectionStatus.schema,
  /** Failed Tunnel Checks in a row. */
  failures: Schema.Number,
  /** Sign-ins Cloud Connect refused in a row, since a Report was last taken. */
  refusals: Schema.Number,
  /** The version of each Plugin to run, by name. */
  wanted: Schema.Record(Schema.String, Wanted),
  /** Where each Plugin stands, as it last reported. */
  plugins: Schema.Record(Schema.String, PluginState.schema),
});
type Model = typeof Model.Type;

const State = Schema.TaggedUnion({
  Online: {},
  SigningIn: {},
  Forgotten: {},
  /** It must stop: why, or null when it was asked to. */
  Stopped: { reason: Schema.NullOr(Schema.String) },
});
type State = typeof State.Type;

const Message = Schema.TaggedUnion({
  Listening: { port: Schema.Finite },
  Installing: { generation: Schema.Number },
  Opening: { generation: Schema.Number },
  OpenFailed: {
    generation: Schema.Number,
    at: Schema.Number,
    problem: Schema.String,
  },
  TunnelUp: { generation: Schema.Number, url: Schema.String },
  TunnelLost: { generation: Schema.Number },
  Checked: { generation: Schema.Number, check: TunnelCheck.schema },
  Reported: { wanted: Schema.Record(Schema.String, Version) },
  PluginReported: { name: Schema.String, state: PluginState.schema },
  SignedOut: {},
  SignedIn: {},
  Forgotten: {},
  Stop: { reason: Schema.NullOr(Schema.String) },
});

type ConnectionSelf = Self<Model, State, typeof Message.Type>;

/** The socket of the Plugin `name`. */
const socketOf = (
  model: { readonly folders: Folders; readonly socketId: string },
  name: string,
) => socketPath(model.folders.runtime, model.socketId, name);

/** The Plugins to run: those Cloud Connect wants, then the files given, which win. */
const wantedOf = (
  model: Model,
  versions: Readonly<Record<string, typeof Version.Type>>,
): Model['wanted'] => {
  const files = Object.fromEntries(
    Object.entries(model.files).map(([name, file]) => [name, { file }]),
  );
  const named = Object.fromEntries(
    Object.entries(versions).filter(
      ([name]) =>
        PLUGIN_NAME.test(name) && socketOf(model, name) !== model.control,
    ),
  );
  return { ...model.wanted, ...named, ...files };
};

/** A new tunnel generation, with no address yet. */
const restarted = (model: Model): Model => ({
  ...model,
  generation: model.generation + 1,
  status: { _tag: 'Opening' },
  failures: 0,
});

/** The status of a tunnel at `url` that `check` found reachable or not. */
const checked = (url: string, check: TunnelCheck): ConnectionStatus =>
  check.ok
    ? { _tag: 'Reachable', url, at: check.at }
    : {
        _tag: 'Unreachable',
        url,
        at: check.at,
        problem: check.problem ?? 'Unknown',
      };

/** Sends a Report of how things stand now, and acts on the answer. */
const report = (self: ConnectionSelf) =>
  Effect.gen(function* () {
    const host = yield* ConnectionHost;
    const { model } = yield* self.get;
    const answer = yield* host.report({
      status: model.status,
      plugins: model.plugins,
    });
    switch (answer._tag) {
      case 'Reported':
        return yield* self.send({ _tag: 'Reported', wanted: answer.wanted });
      case 'Unsent':
        return yield* Effect.logWarning(
          `Heartbeat not sent: ${answer.problem}`,
        );
      case 'Forgotten':
        return yield* self.send({ _tag: 'Forgotten' });
      case 'SignedOut':
        return yield* self.send({ _tag: 'SignedOut' });
      case 'Refused':
        return yield* self.send({ _tag: 'Stop', reason: answer.reason });
    }
  });

/** One beat: check the tunnel if there is one, then Report. */
const beat = (self: ConnectionSelf) =>
  Effect.gen(function* () {
    const host = yield* ConnectionHost;
    const { model } = yield* self.get;
    const url = addressOf(model.status);
    if (url !== null) {
      const check = yield* host.check(url);
      if (!check.ok)
        yield* Effect.logWarning(
          `Tunnel check ${model.failures + 1}/${FAILURES_BEFORE_RESTART} failed: ${check.problem}`,
        );
      yield* self.send({
        _tag: 'Checked',
        generation: model.generation,
        check,
      });
      const after = yield* self.get;
      if (after.model.generation !== model.generation)
        yield* Effect.logWarning(
          'The tunnel is broken; restarting cloudflared',
        );
    }
    yield* report(self);
  });

/** cloudflared, Reporting Installing while it downloads, when that takes a while. */
const install = (self: ConnectionSelf, generation: number) =>
  Effect.gen(function* () {
    const host = yield* ConnectionHost;
    const getting = yield* Effect.forkScoped(host.cloudflared);
    const quick = yield* Fiber.await(getting).pipe(
      Effect.timeoutOption(INSTALLING_AFTER),
    );
    if (Option.isSome(quick)) return yield* quick.value;
    yield* Effect.log('Downloading cloudflared');
    yield* self.send({ _tag: 'Installing', generation });
    yield* report(self);
    const binary = yield* Fiber.join(getting);
    yield* self.send({ _tag: 'Opening', generation });
    yield* report(self);
    return binary;
  });

/** Keeps the tunnel of one generation open, and Reports its new address, or why it has none, at once. */
const keepTunnel = (self: ConnectionSelf, generation: number) =>
  Effect.gen(function* () {
    const host = yield* ConnectionHost;
    const { model } = yield* self.get;
    const port = model.listening ?? 0;
    const opened = yield* Effect.result(
      Effect.flatMap(install(self, generation), (binary) =>
        host.open(port, binary),
      ),
    );
    if (opened._tag === 'Failure') {
      yield* Effect.logWarning('Could not open a tunnel', opened.failure);
      const { failure } = opened;
      yield* self.send({
        _tag: 'OpenFailed',
        generation,
        at: yield* Clock.currentTimeMillis,
        problem: failure instanceof Error ? failure.message : String(failure),
      });
      yield* report(self);
      yield* Effect.sleep(REOPEN_AFTER);
      return yield* self.send({ _tag: 'TunnelLost', generation });
    }
    const { url, closed } = opened.success;
    yield* Effect.log(`Tunnel at ${url}`);
    yield* self.send({ _tag: 'TunnelUp', generation, url });
    yield* report(self);
    yield* closed;
    yield* Effect.logWarning('cloudflared stopped; restarting it');
    yield* self.send({ _tag: 'TunnelLost', generation });
  }).pipe(Effect.scoped);

/** Listens on the public port, passing each Plugin's requests to its socket, until the Worker stops. */
const route = (self: ConnectionSelf) =>
  Effect.gen(function* () {
    const { model } = yield* self.get;
    let wanted = model.wanted;
    const port = yield* Effect.result(
      router({
        port: model.port,
        key: model.key,
        origins: model.origins,
        socketOf: (name) => (name in wanted ? socketOf(model, name) : null),
      }),
    );
    if (port._tag === 'Failure')
      return yield* self.send({ _tag: 'Stop', reason: port.failure.message });
    yield* self.send({ _tag: 'Listening', port: port.success });
    yield* self.changes.pipe(
      Stream.runForEach(({ model }) =>
        Effect.sync(() => {
          wanted = model.wanted;
        }),
      ),
    );
  });

/** Holds the control socket, answering `status` and `stop`, until the Worker stops. */
const control = (self: ConnectionSelf) =>
  Effect.gen(function* () {
    const { model } = yield* self.get;
    const handlers = ConnectionControl.toLayer({
      status: () =>
        Effect.map(self.get, ({ model }) => ({
          name: model.name,
          id: model.id,
          url: addressOf(model.status),
          plugins: model.plugins,
        })),
      stop: () => self.send({ _tag: 'Stop', reason: null }),
    });
    const taken = yield* Effect.result(
      single(model.control, {
        group: ConnectionControl,
        handlers,
      }),
    );
    if (taken._tag === 'Failure')
      return yield* self.send({
        _tag: 'Stop',
        reason: `Could not hold the control socket: ${taken.failure.message}`,
      });
    if (taken.success._tag === 'AlreadyRunning')
      return yield* self.send({
        _tag: 'Stop',
        reason: `${model.name} is already running`,
      });
    return yield* Effect.never;
  });

export const ActorConnection = Actor.build(
  Actor.define('Connection', {
    requires: [ConnectionHost],
    input: Input,
    model: Model,
    state: State,
    message: Message,
  }),
  {
    init: (input: Input) => {
      const model: Model = {
        ...input,
        listening: null,
        generation: 0,
        status: { _tag: 'Opening' },
        failures: 0,
        refusals: 0,
        wanted: {},
        plugins: {},
      };
      return {
        model: { ...model, wanted: wantedOf(model, {}) },
        state: { _tag: 'Online' },
      };
    },
    provides: (self) =>
      Layer.succeed(
        Plugins,
        Plugins.of({
          report: (name, state) =>
            self.send({ _tag: 'PluginReported', name, state }),
        }),
      ),
    children: {
      plugins: {
        actor: ActorPlugin,
        each: ({ model }) => Object.keys(model.wanted),
        input: ({ model }, name) => ({
          name,
          folders: pluginFolders(model.folders, name),
          socket: socketOf(model, name),
        }),
        props: ({ model }, name) => ({ wanted: model.wanted[name]! }),
      },
    },
    on: {
      Listening: ({ port }, { model }) => ({
        model: { ...model, listening: port },
      }),
      PluginReported: ({ name, state }, { model }) => ({
        model: { ...model, plugins: { ...model.plugins, [name]: state } },
      }),
      Forgotten: () => ({ state: { _tag: 'Forgotten' } }),
      Stop: ({ reason }) => ({ state: { _tag: 'Stopped', reason } }),
    },
    workers: {
      router: { run: route },
      control: { run: control },
    },
    state: {
      Online: {
        on: {
          Installing: ({ generation }, { model }) =>
            generation === model.generation
              ? { model: { ...model, status: { _tag: 'Installing' } } }
              : {},
          Opening: ({ generation }, { model }) =>
            generation === model.generation
              ? { model: { ...model, status: { _tag: 'Opening' } } }
              : {},
          OpenFailed: ({ generation, at, problem }, { model }) =>
            generation === model.generation
              ? {
                  model: {
                    ...model,
                    status: { _tag: 'OpenFailed', at, problem },
                  },
                }
              : {},
          TunnelUp: ({ generation, url }, { model }) =>
            generation === model.generation
              ? {
                  model: {
                    ...model,
                    status: { _tag: 'Unchecked', url },
                    failures: 0,
                  },
                }
              : {},
          TunnelLost: ({ generation }, { model }) =>
            generation === model.generation ? { model: restarted(model) } : {},
          Checked: ({ generation, check }, { model }) => {
            const url = addressOf(model.status);
            if (generation !== model.generation || url === null) return {};
            const failures = check.ok ? 0 : model.failures + 1;
            return {
              model:
                failures >= FAILURES_BEFORE_RESTART
                  ? restarted(model)
                  : { ...model, failures, status: checked(url, check) },
            };
          },
          Reported: ({ wanted }, { model }) => ({
            model: {
              ...model,
              refusals: 0,
              wanted: wantedOf(model, wanted),
            },
          }),
          SignedOut: (_, { model }) => ({
            model: { ...restarted(model), refusals: model.refusals + 1 },
            state: { _tag: 'SigningIn' },
          }),
        },
        workers: {
          tunnel: {
            each: ({ model }) =>
              model.listening === null ? [] : [String(model.generation)],
            run: (self, key) => keepTunnel(self, Number(key)),
          },
          beat: {
            run: (self) =>
              Effect.flatMap(ConnectionHost, ({ every }) =>
                Effect.repeat(beat(self), Schedule.spaced(every)),
              ),
          },
        },
      },
      SigningIn: {
        on: {
          SignedIn: () => ({ state: { _tag: 'Online' } }),
        },
        workers: {
          signIn: {
            run: (self) =>
              Effect.gen(function* () {
                const host = yield* ConnectionHost;
                const { model } = yield* self.get;
                const wait = backoffAfter(model.refusals, host.backoff);
                yield* Effect.logWarning(
                  Duration.isZero(wait)
                    ? 'The Sign-in was revoked: the tunnel is closed until you sign in again.'
                    : `Cloud Connect refused the Sign-in again: signing in again in ${Duration.format(wait)}.`,
                );
                yield* Effect.sleep(wait);
                yield* host.signInAgain.pipe(
                  Effect.andThen(self.send({ _tag: 'SignedIn' })),
                  Effect.catch((reason) => self.send({ _tag: 'Stop', reason })),
                );
              }),
          },
        },
      },
      Forgotten: {},
      Stopped: {},
    },
  },
);
