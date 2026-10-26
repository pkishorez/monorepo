import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { PluginState } from '@kestack/cli-platform/plugins/contract';
import { ESchema } from '@kestack/std-toolkit/eschema';

/*
 * How `ke-connect` asks a running Connection on this computer about itself,
 * on the Connection's control socket: `serve` of a name already running,
 * `list` and `remove`. Holding that socket is what makes the Connection the
 * one process of its name. Its values are ESchemas, so a newer `ke-connect`
 * reads a Connection an older one started.
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
