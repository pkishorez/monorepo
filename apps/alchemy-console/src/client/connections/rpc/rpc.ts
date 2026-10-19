import { Context, Effect, Layer, ManagedRuntime } from 'effect';
import { RpcClient } from 'effect/rpc';
import { Rpc as Transport } from '@kestack/rpc-toolkit/rpc';

import { ConsoleApi } from '../../../shared/api/console-api/index.ts';
import { telemetryLayer } from '../../telemetry/index.ts';

const makeClient = RpcClient.make(ConsoleApi);

export class Rpc extends Context.Service<
  Rpc,
  Effect.Success<typeof makeClient>
>()('alchemy-console/Rpc') {}

/** The console's RPC client at `url`. `auth` signs its guarded calls: in
 * the browser, the context of `client/browser`'s Layer. */
export const makeRpcRuntime = <A = never>(
  url: string,
  auth: Context.Context<A> = Context.empty() as Context.Context<A>,
) =>
  ManagedRuntime.make(
    Layer.effect(Rpc, makeClient).pipe(
      Layer.provide([
        Transport.http.client(ConsoleApi, { url }),
        Layer.succeedContext(auth),
      ]),
      Layer.provideMerge(telemetryLayer()),
    ),
  );
