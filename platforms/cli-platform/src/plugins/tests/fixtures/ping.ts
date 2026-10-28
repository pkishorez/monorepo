import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Effect, Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { Plugin, PluginFolders } from '../../plugin/index.js';

/*
 * A tiny Plugin for the tests: `ping` answers which variant it is, and as
 * it stops it leaves a mark in its data folder, so a test sees its
 * finalizers ran; given `stopping`, it takes that many ms to stop first.
 */

export const Ping = RpcGroup.make(Rpc.make('ping', { success: Schema.String }));

export const runPing = (variant: string, stopping = 0) =>
  Plugin.make({
    name: 'ping',
    group: Ping,
    layer: Ping.toLayer(
      Effect.gen(function* () {
        const folders = yield* PluginFolders;
        yield* Effect.addFinalizer(() =>
          Effect.sleep(stopping).pipe(
            Effect.andThen(
              Effect.sync(() =>
                writeFileSync(join(folders.data, `stopped-${variant}`), ''),
              ),
            ),
          ),
        );
        return { ping: () => Effect.succeed(`pong ${variant}`) };
      }),
    ),
  })();
