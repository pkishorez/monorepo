import { Context, Deferred, Effect, Option, Ref, Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { PluginState } from '@kestack/cli-platform/plugins/contract';
import { single } from '@kestack/cli-platform/single';
import { ESchema } from '@kestack/std-toolkit/eschema';

/*
 * How `ke-connect` asks a running Connection on this computer about itself,
 * on the Connection's control socket: `serve` of a name already running,
 * `list` and `remove`. Holding that socket is what makes the Connection the
 * one process of its name. Its values are ESchemas, so a newer `ke-connect`
 * reads a Connection an older one started.
 *
 * `serve` holds the socket before it signs in, so of two serves at once
 * only one signs in or starts a Plugin. Until the Connection runs, the
 * socket answers for it: starting, with no id or address yet, and `stop`
 * ends the start. Once it runs, the Connection answers, through Control.
 */

/** A running Connection as it says of itself. */
export const RunningConnection = ESchema.make('RunningConnection', {
  /** Its name on this computer. */
  name: Schema.String,
  id: Schema.String,
  /** Its tunnel's address; null while it has none. */
  url: Schema.NullOr(Schema.String),
  /** Where each of its Plugins stands, by name. */
  plugins: Schema.Record(Schema.String, PluginState.schema),
}).build();
export type RunningConnection = typeof RunningConnection.Type;

export const ConnectionControl = RpcGroup.make(
  Rpc.make('status', { success: RunningConnection.schema }),
  /** Stops it, as Ctrl-C would. */
  Rpc.make('stop'),
);

/** What a running Connection answers on its control socket. */
export interface Answers {
  readonly status: Effect.Effect<RunningConnection>;
  readonly stop: Effect.Effect<void>;
}

/** The control socket `serve` holds: the Connection answers there from when it runs. */
export class Control extends Context.Service<
  Control,
  { readonly answer: (answers: Answers) => Effect.Effect<void> }
>()('@kestack/connect/Control') {}

/**
 * Holds the control socket at `path` for the Connection `name`, for the
 * Scope: Held, with the Control it answers through and `stopping`, done
 * once `stop` is asked before it runs; or AlreadyRunning, with a client to
 * the process that holds it.
 */
export const hold = (path: string, name: string) =>
  Effect.gen(function* () {
    const answers = yield* Ref.make(Option.none<Answers>());
    const stopping = yield* Deferred.make<void>();
    const taken = yield* single(path, {
      group: ConnectionControl,
      handlers: ConnectionControl.toLayer({
        status: () =>
          Effect.flatMap(
            Ref.get(answers),
            Option.match({
              onNone: () =>
                Effect.succeed<RunningConnection>({
                  name,
                  id: '',
                  url: null,
                  plugins: {},
                }),
              onSome: ({ status }) => status,
            }),
          ),
        stop: () =>
          Effect.flatMap(
            Ref.get(answers),
            Option.match({
              onNone: () => Deferred.succeed(stopping, undefined),
              onSome: ({ stop }) => stop,
            }),
          ),
      }),
    });
    if (taken._tag === 'AlreadyRunning') return taken;
    return {
      _tag: 'Held',
      control: Control.of({
        answer: (given) => Ref.set(answers, Option.some(given)),
      }),
      stopping: Deferred.await(stopping),
    } as const;
  });
