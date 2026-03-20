import type { Deferred, Queue } from "effect";
import { Typed } from "../lib/typed.js";
import type {
  Options as QueryOptions,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";

export const Message = Typed<SDKMessage>();

export type ToolResponse =
  | { behavior: "allow"; updatedInput?: Record<string, unknown> }
  | { behavior: "deny"; message: string };

type SessionOptions = Pick<QueryOptions, "thinking" | "effort" | "model">;
export const ContinueSessionParams = Typed<{
  sessionId: string;
  prompt: string;
  options?: SessionOptions;
}>();

export const RespondToToolParams = Typed<{
  sessionId: string;
  toolUseId: string;
  response: ToolResponse;
}>();

export interface ActiveTurn {
  abortController: AbortController;
  outputQueue: Queue.Queue<SDKMessage>;
  turnId: string;
  pendingTools: Map<string, Deferred.Deferred<ToolResponse>>;
}

export type PermissionModeValue =
  | "acceptEdits"
  | "bypassPermissions"
  | "plan";

export const UpdateSessionParams = Typed<{
  sessionId: string;
  updates: {
    model?: string;
    permissionMode?: PermissionModeValue;
  };
}>();

export const CreateSessionParams = Typed<{
  absolutePath: string;
  prompt: string;
  model?: string;
  permissionMode?: PermissionModeValue;
}>();
