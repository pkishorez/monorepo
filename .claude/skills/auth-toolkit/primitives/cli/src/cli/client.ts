import { CliAuth } from 'auth-toolkit/cli';
import { Context, Effect, Layer } from 'effect';
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc';
import { rpcPath } from '../../infra/config.ts';
import { Greeting } from '../shared/rpc/greeting/index.ts';

const makeGreeting = RpcClient.make(Greeting);

export class GreetingRpc extends Context.Service<
  GreetingRpc,
  Effect.Success<typeof makeGreeting>
>()('cli/GreetingRpc') {}

export const greetingRpc = (apiUrl: string) =>
  Layer.mergeAll(
    Layer.effect(GreetingRpc, makeGreeting).pipe(
      Layer.provide(
        RpcClient.layerProtocolHttp({ url: `${apiUrl}${rpcPath}` }),
      ),
      Layer.provide(RpcSerialization.layerJson),
    ),
    CliAuth.rpcSession,
  );
