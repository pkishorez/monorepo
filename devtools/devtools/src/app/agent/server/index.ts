import { Layer } from 'effect';
import { RpcSerialization, RpcServer } from 'effect/rpc';
import * as ClaudeReal from '@kestack/ai-toolkit-v2/harness/claude/real';
import { AGENT_RPC_PATH, AgentRpc } from './rpc/agent/contract/index.js';
import { agentRpcLayer } from './rpc/agent/real/index.js';
import { sqliteThreadStoreLayer } from './services/thread-store/real/index.js';

export const agentServer = (options: {
  readonly mcp: string;
  readonly db: string;
}) =>
  RpcServer.layerHttp({
    group: AgentRpc,
    path: AGENT_RPC_PATH,
    protocol: 'http',
  }).pipe(
    Layer.provide(agentRpcLayer(options)),
    Layer.provide(
      Layer.mergeAll(
        ClaudeReal.layer({ linger: 0 }),
        sqliteThreadStoreLayer({ path: options.db }),
      ),
    ),
    Layer.provide(RpcSerialization.layerNdjson),
  );

export const agentEndpoints: Readonly<Record<string, string>> = {
  [AGENT_RPC_PATH]:
    "Agent RPC: Claude Code asked about a folder, with read-only tools and, when asked with mcp, DevTools' own MCP tools, in Threads saved in DevTools' database under a folder and a kind the asker names: ask, followUp, threads, watch (a Thread's messages, streamed), cancel and clear (every Thread of a kind in a folder).",
};
