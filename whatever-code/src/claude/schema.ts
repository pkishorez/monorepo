import { Typed } from "../lib/typed.js";
import type {
  Options as QueryOptions,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";

export const Message = Typed<SDKMessage>();

type SessionOptions = Pick<QueryOptions, "thinking" | "effort" | "model">;
export const QueryParams = Typed<{
  prompt: string;
  cwd: string;
  options?: SessionOptions;
}>();
export const ContinueSessionParams = Typed<{
  sessionId: string;
  prompt: string;
  options?: SessionOptions;
}>();
