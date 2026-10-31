import { Effect, Layer, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import type { Self } from '@kestack/kabuki/core/actor';
import { Plugins, PluginState } from '@kestack/cli-platform/plugins';
import type { PluginVersion } from '../../cloud/contract/index.js';
import { ActorOnline } from './actor-online/index.js';
import { ActorPlugins, socketOf } from './actor-plugins/index.js';
import { Connection } from './capabilities/index.js';
import { Control } from './control.js';
import { remember } from './remember.js';

/*
 * One running Connection, standing on who it is, given as Input. It has
 * two parts that never see each other: actor-online/ is the Connection as
 * Cloud Connect knows it, its tunnel and its Heartbeat, and actor-plugins/
 * is what it serves, its router and its Plugins. Each tells the Connection
 * what it learned, and the Connection hands it to the other as Props: Cloud
 * Connect's answer becomes the Plugins wanted; each Plugin's State and the
 * router's port go to the next Heartbeat and the tunnel.
 *
 * A Plugin Cloud Connect names is started, and a new version swaps it; one
 * no longer named keeps running. Until Cloud Connect answers, the Plugins
 * run at the Release the Connection last wanted, which the remember
 * Worker keeps on disk; the first answer wins over it. Always, the control Worker
 * answers on the Connection's control socket, which `serve` holds, the
 * lock that makes it the one process of its name. A forgotten, refused or
 * Outdated Connection ends it, and so does `stop` on the control socket.
 */

/** A Plugin's name: what a folder and a socket can be named. */
const PLUGIN_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

const Version = Schema.Struct({ hash: Schema.String, url: Schema.String });

const FoldersSchema = Schema.Struct({
  data: Schema.String,
  state: Schema.String,
  cache: Schema.String,
  shared: Schema.String,
  runtime: Schema.String,
});

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
  /** The Release of each Plugin it last wanted, as remember.ts kept it, until Cloud Connect answers. */
  lastWanted: Schema.Record(Schema.String, Version),
});
type Input = typeof Input.Type;

/** Who a running Connection is, as it is given. */
export type ConnectionInput = Input;

const Model = Schema.Struct({
  ...Input.fields,
  /** The port the router listens on; null until it does. */
  listening: Schema.NullOr(Schema.Finite),
  /** The tunnel's address; null while there is none. */
  url: Schema.NullOr(Schema.String),
  /** The version of each Plugin to run, by name. */
  wanted: Schema.Record(Schema.String, Version),
  /** Where each Plugin stands, as it last reported. */
  plugins: Schema.Record(Schema.String, PluginState.schema),
});
type Model = typeof Model.Type;

const State = Schema.TaggedUnion({
  Running: {},
  Forgotten: {},
  /** It must stop: why, or null when it was asked to. */
  Stopped: { reason: Schema.NullOr(Schema.String) },
});
type State = typeof State.Type;

const Message = Schema.TaggedUnion({
  Listening: { port: Schema.Finite },
  Wanted: { versions: Schema.Record(Schema.String, Version) },
  Addressed: { url: Schema.NullOr(Schema.String) },
  PluginReported: { name: Schema.String, state: PluginState.schema },
  Forgotten: {},
  Stop: { reason: Schema.NullOr(Schema.String) },
});

type ConnectionSelf = Self<Model, State, typeof Message.Type>;

/** The Plugins to run: those run so far, with the Releases Cloud Connect wants over them. */
const wantedOf = (
  model: Model,
  versions: Readonly<Record<string, PluginVersion>>,
): Model['wanted'] => {
  const named = Object.fromEntries(
    Object.entries(versions).filter(
      ([name]) =>
        PLUGIN_NAME.test(name) && socketOf(model, name) !== model.control,
    ),
  );
  return { ...model.wanted, ...named };
};

/** Keeps the Releases wanted on disk each time they change, until the Worker stops. */
const rememberWanted = (self: ConnectionSelf) =>
  Effect.flatMap(self.get, ({ model }) =>
    self.changes.pipe(
      Stream.map(({ model }) => model.wanted),
      Stream.changesWith((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      Stream.runForEach((releases) => remember(model.folders.data, releases)),
    ),
  );

/** Answers `status` and `stop` on the control socket `serve` holds, until the Worker stops. */
const control = (self: ConnectionSelf) =>
  Effect.gen(function* () {
    const held = yield* Control;
    yield* held.answer({
      status: Effect.map(self.get, ({ model }) => ({
        name: model.name,
        id: model.id,
        url: model.url,
        plugins: model.plugins,
      })),
      stop: self.send({ _tag: 'Stop', reason: null }),
    });
    return yield* Effect.never;
  });

export const ActorConnection = Actor.define('Connection', {
  requires: [Control],
  input: Input,
  model: Model,
  state: State,
  message: Message,
}).build({
  init: (input: Input) => {
    const model: Model = {
      ...input,
      listening: null,
      url: null,
      wanted: {},
      plugins: {},
    };
    return {
      model: { ...model, wanted: wantedOf(model, input.lastWanted) },
      state: { _tag: 'Running' },
    };
  },
  provides: (self) =>
    Layer.mergeAll(
      Layer.succeed(
        Plugins,
        Plugins.of({
          report: (name, state) =>
            self.send({ _tag: 'PluginReported', name, state }),
        }),
      ),
      Layer.succeed(
        Connection,
        Connection.of({
          listening: (port) => self.send({ _tag: 'Listening', port }),
          wanted: (versions) => self.send({ _tag: 'Wanted', versions }),
          address: (url) => self.send({ _tag: 'Addressed', url }),
          forgotten: self.send({ _tag: 'Forgotten' }),
          stop: (reason) => self.send({ _tag: 'Stop', reason }),
        }),
      ),
    ),
  children: {
    plugins: Actor.child(ActorPlugins, {
      input: ({ model }) => ({
        key: model.key,
        folders: model.folders,
        socketId: model.socketId,
        port: model.port,
        origins: model.origins,
      }),
      props: ({ model }) => ({
        wanted: model.wanted,
        plugins: model.plugins,
      }),
    }),
  },
  on: {
    Listening: ({ port }, { model }) => ({
      model: { ...model, listening: port },
    }),
    Addressed: ({ url }, { model }) => ({ model: { ...model, url } }),
    PluginReported: ({ name, state }, { model }) => ({
      model: { ...model, plugins: { ...model.plugins, [name]: state } },
    }),
    Forgotten: () => ({ state: { _tag: 'Forgotten' } }),
    Stop: ({ reason }) => ({ state: { _tag: 'Stopped', reason } }),
  },
  workers: {
    control: { run: control },
    remember: { run: rememberWanted },
  },
  states: {
    Running: {
      children: {
        online: Actor.child(ActorOnline, {
          props: ({ model }) => ({
            port: model.listening,
            plugins: model.plugins,
          }),
        }),
      },
      on: {
        Wanted: ({ versions }, { model }) => ({
          model: { ...model, wanted: wantedOf(model, versions) },
        }),
      },
    },
    Forgotten: {},
    Stopped: {},
  },
});
