import { Typed } from "../lib/typed.js";
import type {
  GetSessionMessagesOptions,
  ListSessionsOptions,
  Options as QueryOptions,
  SDKMessage,
  SDKSessionInfo,
  SessionMessage as SDKSessionMessage,
} from "@anthropic-ai/claude-agent-sdk";

export const Message = Typed<SDKMessage>();
export const SessionInfo = Typed<SDKSessionInfo>();
export const SessionMessage = Typed<SDKSessionMessage>();

export const QueryParams = Typed<{
  prompt: string;
  sessionId?: string;
  options?: QueryOptions;
}>();
export const ListSessionsParams = Typed<ListSessionsOptions>();
export const GetSessionMessagesParams = Typed<
  GetSessionMessagesOptions & { sessionId: string }
>();
