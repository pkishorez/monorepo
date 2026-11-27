import { Effect, Layer, Stream } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http';
import { RpcClient, RpcSerialization } from 'effect/rpc';
import type { RpcClientError } from 'effect/rpc';
import {
  AGENT_RPC_PATH,
  AgentRpc,
  type AgentError,
} from '../../../agent/server/rpc/agent/contract/index.js';
import { Agent, AgentProblem, type AgentService } from '../contract/index.js';

type Client = RpcClient.FromGroup<
  typeof AgentRpc,
  RpcClientError.RpcClientError
>;

const problemOf = (error: AgentError | RpcClientError.RpcClientError) =>
  new AgentProblem({
    message:
      error._tag === 'AgentError'
        ? error.message
        : `The DevTools server could not be reached: ${error.message}`,
  });

const agentOn = (client: Client): AgentService =>
  Agent.of({
    ask: (question) => Effect.mapError(client.ask(question), problemOf),
    followUp: (followUp) =>
      Effect.mapError(client.followUp(followUp), problemOf),
    threads: (folder) => Effect.mapError(client.threads({ folder }), problemOf),
    watch: (thread) => Stream.mapError(client.watch({ thread }), problemOf),
    cancel: (thread) => Effect.mapError(client.cancel({ thread }), problemOf),
  });

export const agentLayer = (origin: string) =>
  Layer.effect(Agent, Effect.map(RpcClient.make(AgentRpc), agentOn)).pipe(
    Layer.provide(
      RpcClient.layerProtocolHttp({
        url: origin,
        transformClient: HttpClient.mapRequest(
          HttpClientRequest.appendUrl(AGENT_RPC_PATH),
        ),
      }),
    ),
    Layer.provide(RpcSerialization.layerNdjson),
    Layer.provide(FetchHttpClient.layer),
  );
