import { Effect, Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { Plugin } from '@kestack/cli-platform/plugins/plugin';

/* A tiny Plugin for the tests: `ping` answers `pong`. */

export const Ping = RpcGroup.make(Rpc.make('ping', { success: Schema.String }));

export const runPing = () =>
  Plugin.make({
    name: 'ping',
    group: Ping,
    layer: Ping.toLayer({ ping: () => Effect.succeed('pong') }),
  })();
