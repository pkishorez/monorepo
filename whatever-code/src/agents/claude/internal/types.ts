import type { Deferred, Fiber, Queue } from "effect";
import type {
  SDKMessage,
  McpServerConfig,
  HookEvent,
  HookCallbackMatcher,
  PermissionResult,
  Query,
} from "@anthropic-ai/claude-agent-sdk";
import type { OnExecuteStatusUpdate } from "../../workflow/schema.js";

export interface ActiveTurn {
  query: Query | null;
  fiber: Fiber.RuntimeFiber<void, Error> | null;
  stopped: boolean;
  resultReceived: boolean;
  outputQueue: Queue.Queue<SDKMessage>;
  turnId: string;
  initialized: Deferred.Deferred<void, Error>;
  /**
   * Map of toolUseId → deferred permission result for AskUserQuestion calls
   * awaiting user response. Resolved when the user answers via the
   * `respondToUserQuestion` RPC.
   */
  pendingQuestions: Map<string, Deferred.Deferred<PermissionResult, Error>>;
  /** Optional callback to push status updates into the workflow entity. */
  onStatusUpdate?: OnExecuteStatusUpdate;
}

export interface SessionCapabilities {
  models: {
    value: string;
    displayName: string;
    description: string;
  }[];
  commands: { name: string; description: string; argumentHint: string }[];
}

export interface SessionRuntimeOptions {
  mcpServers?: Record<string, McpServerConfig>;
  systemPrompt?:
    | string
    | { type: "preset"; preset: "claude_code"; append?: string };
  hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
}
