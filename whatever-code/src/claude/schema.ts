import type { Queue } from "effect";
import { Typed } from "../lib/typed.js";
import type {
  Options as QueryOptions,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";

export const Message = Typed<SDKMessage>();

type SessionOptions = Pick<QueryOptions, "thinking" | "effort" | "model">;
export const ContinueSessionParams = Typed<{
  sessionId: string;
  prompt: string;
  options?: SessionOptions;
}>();

export interface ActiveTurn {
  abortController: AbortController;
  outputQueue: Queue.Queue<SDKMessage>;
  turnId: string;
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
