import type { Deferred, Queue } from "effect";
import type { SDKMessage, McpServerConfig, HookEvent, HookCallbackMatcher } from "@anthropic-ai/claude-agent-sdk";
import type { ToolResponse } from "./schema.js";

export interface ActiveTurn {
  abortController: AbortController;
  outputQueue: Queue.Queue<SDKMessage>;
  turnId: string;
  initialized: Deferred.Deferred<void, Error>;
}

export interface PendingToolResponse {
  deferred: Deferred.Deferred<ToolResponse, Error>;
  sessionId: string;
  turnId: string;
}

export interface SessionCapabilities {
  models: { value: string; displayName: string; description: string }[];
  commands: { name: string; description: string; argumentHint: string }[];
}

export interface SessionRuntimeOptions {
  mcpServers?: Record<string, McpServerConfig>;
  systemPrompt?:
    | string
    | { type: "preset"; preset: "claude_code"; append?: string };
  hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
}
