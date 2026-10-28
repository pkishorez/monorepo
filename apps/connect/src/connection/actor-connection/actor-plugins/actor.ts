import { Effect, Schema, Stream } from 'effect';
import { Actor, type Self, type Single } from '@kestack/kabuki';
import {
  pluginFolders,
  socketPath,
  type Folders,
} from '@kestack/cli-platform/files';
import { ActorPlugin } from '@kestack/cli-platform/plugins';
import { Connection } from '../capabilities/index.js';
import { router } from './router.js';

/*
 * What a Connection serves. Always, the router Worker listens on the
 * Connection's public port and passes `/<plugin>/…` to each Plugin's
 * socket, once it has checked the Connection Key, and tells the Connection
 * the port it got. One ActorPlugin Child per Plugin wanted keeps it running
 * at that version, and reports where it stands up through Plugins, which
 * the Connection Provides.
 */

const FoldersSchema = Schema.Struct({
  data: Schema.String,
  state: Schema.String,
  cache: Schema.String,
  runtime: Schema.String,
});

/** Which Plugin to run, as ActorPlugin takes it: a download, or a local file. */
export const Wanted = Schema.Union([
  Schema.Struct({ hash: Schema.String, url: Schema.String }),
  Schema.Struct({ file: Schema.String }),
]);

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
});

type PluginsSelf = Self<Input, Single, never, typeof Props.Type>;

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
    let wanted = props.wanted;
    const port = yield* Effect.result(
      router({
        port: model.port,
        key: model.key,
        origins: model.origins,
        socketOf: (name) => (name in wanted ? socketOf(model, name) : null),
      }),
    );
    if (port._tag === 'Failure')
      return yield* connection.stop(port.failure.message);
    yield* connection.listening(port.success);
    yield* self.changes.pipe(
      Stream.runForEach(({ props }) =>
        Effect.sync(() => {
          wanted = props.wanted;
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
