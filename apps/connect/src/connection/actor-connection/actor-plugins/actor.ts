import { Effect, Schema, Stream } from 'effect';
import { Actor, type Self, type Single } from '@kestack/kabuki';
import {
  pluginFolders,
  socketPath,
  type Folders,
} from '@kestack/cli-platform/files';
import { ActorPlugin, PluginState } from '@kestack/cli-platform/plugins';
import { Connection } from '../capabilities/index.js';
import { router } from './router.js';

/*
 * What a Connection serves. Always, the router Worker listens on the
 * Connection's public port and passes `/<plugin>/<sha256>/rpc` to each
 * Plugin's socket while the Plugin runs that Release, once it has checked
 * the Connection Key, and tells the Connection the port it got. Which
 * Release runs it reads from each Plugin State, as the Connection hands
 * them down. One ActorPlugin
 * Child per Plugin wanted keeps it running at that version, and reports
 * where it stands up through Plugins, which the Connection Provides.
 */

const FoldersSchema = Schema.Struct({
  data: Schema.String,
  state: Schema.String,
  cache: Schema.String,
  shared: Schema.String,
  runtime: Schema.String,
});

/** Which Release of a Plugin to run: its sha256, and where on the Shelf to read it. */
const Wanted = Schema.Struct({ hash: Schema.String, url: Schema.String });

const Input = Schema.Struct({
  /** The Connection Key. */
  key: Schema.String,
  folders: FoldersSchema,
  /** What names its Plugins' sockets: their paths take its first 8 characters. */
  socketId: Schema.String,
  /** The public port to listen on; 0 for any free one. */
  port: Schema.Finite,
  /** The origins a browser page may call from. */
  origins: Schema.Array(Schema.String),
});
type Input = typeof Input.Type;

const Props = Schema.Struct({
  /** The version of each Plugin to run, by name. */
  wanted: Schema.Record(Schema.String, Wanted),
  /** Where each Plugin stands, as it last reported. */
  plugins: Schema.Record(Schema.String, PluginState.schema),
});
type Props = typeof Props.Type;

type PluginsSelf = Self<Input, Single, never, Props>;

/** The Release the Plugin `name` runs instead of `hash`, null while it runs none; undefined when it serves `hash`. */
const otherThan = (props: Props, name: string, hash: string) => {
  const state = props.plugins[name];
  const running = state?._tag === 'Running' ? state.hash : null;
  return running === hash ? undefined : running;
};

/** The socket of the Plugin `name`. */
export const socketOf = (
  model: { readonly folders: Folders; readonly socketId: string },
  name: string,
) => socketPath(model.folders.runtime, model.socketId, name);

/** Listens on the public port, passing each Plugin's requests to its socket, until the Worker stops. */
const route = (self: PluginsSelf) =>
  Effect.gen(function* () {
    const connection = yield* Connection;
    const { model, props } = yield* self.get;
    let now = props;
    const port = yield* Effect.result(
      router({
        port: model.port,
        key: model.key,
        origins: model.origins,
        socketOf: (name) => (name in now.wanted ? socketOf(model, name) : null),
        otherThan: (name, hash) => otherThan(now, name, hash),
      }),
    );
    if (port._tag === 'Failure')
      return yield* connection.stop(port.failure.message);
    yield* connection.listening(port.success);
    yield* self.changes.pipe(
      Stream.runForEach(({ props }) =>
        Effect.sync(() => {
          now = props;
        }),
      ),
    );
  });

export const ActorPlugins = Actor.build(
  Actor.define('Plugins', {
    requires: [Connection],
    input: Input,
    props: Props,
    model: Input,
  }),
  {
    init: (input: Input) => ({ model: input }),
    children: {
      plugins: {
        actor: ActorPlugin,
        each: ({ props }) => Object.keys(props.wanted),
        input: ({ model }, name) => ({
          name,
          folders: pluginFolders(model.folders, name),
          socket: socketOf(model, name),
        }),
        props: ({ props }, name) => ({ wanted: props.wanted[name]! }),
      },
    },
    workers: {
      router: { run: route },
    },
  },
);
