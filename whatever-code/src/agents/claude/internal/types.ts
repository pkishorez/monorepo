import type { Deferred, Fiber, Queue } from "effect";
import type {
  SDKMessage,
  McpServerConfig,
  HookEvent,
  HookCallbackMatcher,
  Query,
} from "@anthropic-ai/claude-agent-sdk";

export interface ActiveTurn {
  query: Query | null;
  fiber: Fiber.RuntimeFiber<void, Error> | null;
  stopped: boolean;
  resultReceived: boolean;
  outputQueue: Queue.Queue<SDKMessage>;
  turnId: string;
  initialized: Deferred.Deferred<void, Error>;
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
