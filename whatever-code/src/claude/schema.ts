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

export const UpdateModelParams = Typed<{
  sessionId: string;
  model: string;
}>();
