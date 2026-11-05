import { Effect, Layer, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import type { Self, Single } from '@kestack/kabuki/core/actor';
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
import { Release } from '../../../../contract/index.js';
import { Identity } from '../capabilities/index.js';
import { ActorTunnel } from './actor-tunnel/index.js';
import { Connection } from './capabilities/index.js';
import { Control } from './control.js';
import { remember } from './remember.js';
import { router } from './router.js';

/*
 * One running Connection, which exists only while its User is signed in. It
 * listens on its public port: the router Worker passes `/<plugin>/<sha256>/rpc`
 * to each Plugin's socket while the Plugin runs that Release, once it has
 * checked the Connection Key. Beside it run its two kinds of Child, which never
 * see each other: the tunnel, which points at that port and tells Connect
 * Cloud where it stands, and one Plugin per Plugin wanted, kept running at that
 * Release.
 *
 * The tunnel hands up what Connect Cloud answered, which becomes the Plugins
 * wanted. A Plugin Connect Cloud names is started, and a new Release swaps it;
 * one no longer named keeps running. Until Connect Cloud answers, the Plugins
 * run at the Release the Connection last wanted, which the remember Worker
 * keeps on disk; the first answer wins over it. The control Worker answers on
 * the Connection's control socket, which `serve` holds, for as long as the
 * Connection runs.
 */

/** A Plugin's name: what a folder and a socket can be named. */
const PLUGIN_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

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
  /** The Release of each Plugin it last wanted, as remember.ts kept it, until Connect Cloud answers. */
  lastWanted: Schema.Record(Schema.String, Release),
});
type Input = typeof Input.Type;

const Model = Schema.Struct({
  ...Input.fields,
  /** The port the router listens on; null until it does. */
  listening: Schema.NullOr(Schema.Finite),
  /** The tunnel's address; null while there is none. */
  url: Schema.NullOr(Schema.String),
  /** The Release of each Plugin to run, by name. */
  wanted: Schema.Record(Schema.String, Release),
  /** Where each Plugin stands, as it last reported. */
  plugins: Schema.Record(Schema.String, PluginState.schema),
});
type Model = typeof Model.Type;

const Message = Schema.TaggedUnion({
  Listening: { port: Schema.Finite },
  Wanted: { releases: Schema.Record(Schema.String, Release) },
  Addressed: { url: Schema.NullOr(Schema.String) },
  PluginReported: { name: Schema.String, state: PluginState.schema },
});

type ConnectionSelf = Self<Model, Single, typeof Message.Type>;

/** The socket of the Plugin `name`. */
const socketOf = (
  model: { readonly folders: Folders; readonly socketId: string },
  name: string,
) => socketPath(model.folders.runtime, model.socketId, name);

/** The Plugins to run: those run so far, with the Releases Connect Cloud wants over them. */
const wantedOf = (
  model: Model,
  releases: Readonly<Record<string, Release>>,
): Model['wanted'] => {
  const named = Object.fromEntries(
    Object.entries(releases).filter(
      ([name]) =>
        PLUGIN_NAME.test(name) && socketOf(model, name) !== model.control,
    ),
  );
  return { ...model.wanted, ...named };
};

/** The Release the Plugin `name` runs instead of `hash`, null while it runs none; undefined when it serves `hash`. */
const otherThan = (model: Model, name: string, hash: string) => {
  const state = model.plugins[name];
  const running = state?._tag === 'Running' ? state.hash : null;
  return running === hash ? undefined : running;
};

/** Listens on the public port, passing each Plugin's requests to its socket, until the Worker stops. */
const route = (self: ConnectionSelf) =>
  Effect.gen(function* () {
    const identity = yield* Identity;
    const { model } = yield* self.get;
    let now = model;
    const port = yield* Effect.result(
      router({
        port: model.port,
        key: model.key,
        origins: model.origins,
        socketOf: (name) => (name in now.wanted ? socketOf(now, name) : null),
        otherThan: (name, hash) => otherThan(now, name, hash),
      }),
    );
    if (port._tag === 'Failure')
      return yield* identity.stop(port.failure.message);
    yield* Effect.log(`listening on 127.0.0.1:${port.success}`);
    yield* self.send({ _tag: 'Listening', port: port.success });
    yield* self.changes.pipe(
      Stream.runForEach(({ model }) =>
        Effect.sync(() => {
          now = model;
        }),
      ),
    );
  });

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
    const identity = yield* Identity;
    yield* held.answer({
      status: Effect.map(self.get, ({ model }) => ({
        name: model.name,
        id: model.id,
        url: model.url,
        plugins: model.plugins,
      })),
      stop: identity.stop(null),
    });
    return yield* Effect.never;
  }).pipe(Effect.scoped);

export const ActorConnection = Actor.define('Connection', {
  requires: [Control, Identity],
  input: Input,
  model: Model,
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
    return { model: { ...model, wanted: wantedOf(model, input.lastWanted) } };
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
          wanted: (releases) => self.send({ _tag: 'Wanted', releases }),
          address: (url) => self.send({ _tag: 'Addressed', url }),
        }),
      ),
    ),
  children: {
    tunnel: Actor.child(ActorTunnel, {
      while: ({ model }) => model.listening !== null,
      input: ({ model }) => ({ port: model.listening ?? 0 }),
    }),
    plugins: Actor.child(ActorPlugin, {
      each: ({ model }) => Object.keys(model.wanted),
      input: ({ model }, name) => ({
        name,
        folders: pluginFolders(model.folders, name),
        socket: socketOf(model, name),
      }),
      props: ({ model }, name) => ({ wanted: model.wanted[name]! }),
    }),
  },
  on: {
    Listening: ({ port }, { model }) => ({
      model: { ...model, listening: port },
    }),
    Wanted: ({ releases }, { model }) => ({
      model: { ...model, wanted: wantedOf(model, releases) },
    }),
    Addressed: ({ url }, { model }) => ({ model: { ...model, url } }),
    PluginReported: ({ name, state }, { model }) => ({
      model: { ...model, plugins: { ...model.plugins, [name]: state } },
    }),
  },
  workers: {
    router: { run: route },
    control: { run: control },
    remember: { run: rememberWanted },
  },
});
