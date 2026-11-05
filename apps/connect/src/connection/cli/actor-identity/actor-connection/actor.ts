import { Duration, Effect, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import type { Self } from '@kestack/kabuki/core/actor';
import {
  pluginFolders,
  socketPath,
  type Folders,
} from '@kestack/cli-platform/files';
import { ActorPlugin, PluginState } from '@kestack/cli-platform/plugins';
import { Release } from '../../../../contract/index.js';
import { ActorTunnel } from './actor-tunnel/index.js';
import { newConnectionKey, server } from './server/index.js';

/*
 * One running Connection, which exists only while its User is signed in.
 *
 * The server Worker mints the Connection Key and opens the public port, which
 * passes `/<plugin>/<sha256>/rpc` to each Plugin's socket while the Plugin runs
 * that Release, once it has checked the key. It belongs to no State, as it
 * holds the port. Once it is Listening, rotateKey mints a new key every hour;
 * the server reads the key on each request, so that needs no restart, and the
 * Tunnel, handed it, tells Connect Cloud at once. The key is kept nowhere but
 * here: a new Connection, or a new start, makes a new one.
 *
 * Listening, two kinds of Child run beside each other, and never see each
 * other: the Tunnel, which points at the port and tells Connect Cloud where it
 * stands, and one Plugin per Plugin wanted, kept running at that Release.
 *
 * What Connect Cloud answers comes up from the Tunnel as Wanted, and is the
 * only thing that says which Plugins to run: until it answers they wait,
 * however the tunnel stands, and a broken tunnel never stops one. The Plugins
 * running are the Plugins it names: one newly named is started, a new Release
 * swaps it, and one no longer named stops. A Report that fails answers nothing,
 * so it changes nothing.
 *
 * A port that cannot be opened ends the Connection's use: it Emits
 * ServerFailed, and Identity ends the program, saying why.
 */

/** A Plugin's name: what a folder and a socket can be named. */
const PLUGIN_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** How long a Connection Key lasts, in ms, unless a test says otherwise. */
export const ROTATE_EVERY = Duration.toMillis(Duration.hours(1));

const FoldersSchema = Schema.Struct({
  data: Schema.String,
  state: Schema.String,
  cache: Schema.String,
  shared: Schema.String,
  runtime: Schema.String,
});

const Input = Schema.Struct({
  folders: FoldersSchema,
  /** What names its Plugins' sockets: their paths take its first 8 characters. */
  socketId: Schema.String,
  /** Its control socket, the lock that makes it the one process of its name. */
  control: Schema.String,
  /** The public port to listen on; 0 for any free one. */
  port: Schema.Finite,
  /** The origins a browser page may call from. */
  origins: Schema.Array(Schema.String),
  /** How long a Connection Key lasts, in ms. */
  rotateEvery: Schema.Finite,
});
type Input = typeof Input.Type;

const Model = Schema.Struct({
  ...Input.fields,
  /** The Release of each Plugin to run, by name. */
  wanted: Schema.Record(Schema.String, Release),
  /** Where each Plugin stands, as it last reported. */
  plugins: Schema.Record(Schema.String, PluginState.schema),
});
type Model = typeof Model.Type;

const State = Schema.TaggedUnion({
  /** The port is not open yet. */
  Starting: {},
  /** The port it got, and the Connection Key now. */
  Listening: { port: Schema.Finite, key: Schema.String },
});
type State = typeof State.Type;

const Message = Schema.TaggedUnion({
  Listening: { port: Schema.Finite, key: Schema.String },
  ServerFailed: { reason: Schema.String },
  KeyRotated: { key: Schema.String },
  Wanted: { releases: Schema.Record(Schema.String, Release) },
  PluginReported: { name: Schema.String, state: PluginState.schema },
});

type ConnectionSelf = Self<Model, State, typeof Message.Type>;

/** The socket of the Plugin `name`. */
const socketOf = (
  model: { readonly folders: Folders; readonly socketId: string },
  name: string,
) => socketPath(model.folders.runtime, model.socketId, name);

/** The Plugins to run: exactly those Connect Cloud names that a folder and a socket can be named for. */
const wantedOf = (
  model: Model,
  releases: Readonly<Record<string, Release>>,
): Model['wanted'] =>
  Object.fromEntries(
    Object.entries(releases).filter(
      ([name]) =>
        PLUGIN_NAME.test(name) && socketOf(model, name) !== model.control,
    ),
  );

/** The Release the Plugin `name` runs instead of `hash`, null while it runs none; undefined when it serves `hash`. */
const otherThan = (model: Model, name: string, hash: string) => {
  const state = model.plugins[name];
  const running = state?._tag === 'Running' ? state.hash : null;
  return running === hash ? undefined : running;
};

/** Mints the first key and listens on the public port, passing each Plugin's requests to its socket, until the Worker stops. */
const serve = (self: ConnectionSelf) =>
  Effect.gen(function* () {
    const start = yield* self.get;
    let now = start;
    const first = newConnectionKey();
    const port = yield* Effect.result(
      server({
        port: start.model.port,
        origins: start.model.origins,
        key: () => (now.state._tag === 'Listening' ? now.state.key : first),
        socketOf: (name) =>
          name in now.model.wanted ? socketOf(now.model, name) : null,
        otherThan: (name, hash) => otherThan(now.model, name, hash),
      }),
    );
    if (port._tag === 'Failure')
      return yield* self.send({
        _tag: 'ServerFailed',
        reason: port.failure.message,
      });
    yield* Effect.log(`listening on 127.0.0.1:${port.success}`);
    yield* self.send({ _tag: 'Listening', port: port.success, key: first });
    yield* self.changes.pipe(
      Stream.runForEach((data) =>
        Effect.sync(() => {
          now = data;
        }),
      ),
    );
  });

/** Mints a new Connection Key every `rotateEvery`. */
const rotateKey = (self: ConnectionSelf) =>
  Effect.flatMap(self.get, ({ model }) =>
    Effect.sleep(Duration.millis(model.rotateEvery)).pipe(
      Effect.andThen(
        Effect.suspend(() =>
          self.send({ _tag: 'KeyRotated', key: newConnectionKey() }),
        ),
      ),
      Effect.forever,
    ),
  );

export const ActorConnection = Actor.define('Connection', {
  input: Input,
  model: Model,
  state: State,
  message: Message,
  emits: {
    /** The public port cannot be opened, and why. */
    ServerFailed: { reason: Schema.String },
  },
}).build({
  init: (input: Input) => ({
    model: { ...input, wanted: {}, plugins: {} },
    state: { _tag: 'Starting' },
  }),
  workers: {
    server: { run: serve },
  },
  states: {
    Starting: {
      on: {
        Listening: ({ port, key }) => ({
          state: { _tag: 'Listening', port, key },
        }),
        ServerFailed: ({ reason }) => ({
          emit: { _tag: 'ServerFailed', reason },
        }),
      },
    },
    Listening: {
      children: {
        tunnel: Actor.child(ActorTunnel, {
          input: ({ state }) => ({ port: state.port }),
          props: ({ state }) => ({ key: state.key }),
          emits: {
            Wanted: ({ releases }) => ({ _tag: 'Wanted', releases }),
          },
        }),
        plugins: Actor.child(ActorPlugin, {
          each: ({ model }) => Object.keys(model.wanted),
          input: ({ model }, name) => ({
            name,
            folders: pluginFolders(model.folders, name),
            socket: socketOf(model, name),
          }),
          props: ({ model }, name) => ({ wanted: model.wanted[name]! }),
          emits: {
            Reported: ({ state }, name) => ({
              _tag: 'PluginReported',
              name,
              state,
            }),
          },
        }),
      },
      on: {
        KeyRotated: ({ key }, { state }) => ({ state: { ...state, key } }),
        Wanted: ({ releases }, { model }) => {
          const wanted = wantedOf(model, releases);
          return {
            model: {
              ...model,
              wanted,
              // A Plugin stopped says no more: what it last said must not
              // answer for it if it is named again.
              plugins: Object.fromEntries(
                Object.entries(model.plugins).filter(
                  ([name]) => name in wanted,
                ),
              ),
            },
          };
        },
        // A word still on its way from a Plugin no longer named is dropped.
        PluginReported: ({ name, state }, { model }) =>
          name in model.wanted
            ? {
                model: {
                  ...model,
                  plugins: { ...model.plugins, [name]: state },
                },
              }
            : {},
      },
      workers: {
        rotateKey: { run: rotateKey },
      },
    },
  },
});
