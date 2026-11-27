import { Layer } from 'effect';
import { RpcSerialization, RpcServer } from 'effect/rpc';
import * as ClaudeReal from '@kestack/ai-toolkit-v2/claude/real';
import { AGENT_RPC_PATH, AgentRpc } from './rpc/agent/contract/index.js';
import { agentRpcLayer } from './rpc/agent/real/index.js';

export const agentServer = RpcServer.layerHttp({
  group: AgentRpc,
  path: AGENT_RPC_PATH,
  protocol: 'http',
}).pipe(
  Layer.provide(agentRpcLayer),
  Layer.provide(ClaudeReal.layer({ linger: 0 })),
  Layer.provide(RpcSerialization.layerNdjson),
);

export const agentEndpoints: Readonly<Record<string, string>> = {
  [AGENT_RPC_PATH]:
    "Agent RPC: Claude Code asked about a folder, with read-only tools, in Threads kept until restart: ask, followUp, threads, watch (a Thread's messages, streamed) and cancel.",
};
