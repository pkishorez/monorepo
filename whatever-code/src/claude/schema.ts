import { Typed } from "../lib/typed.js";
import type {
  GetSessionMessagesOptions,
  ListSessionsOptions,
  Options as QueryOptions,
  SDKMessage,
  SDKSessionInfo,
  SessionMessage,
} from "@anthropic-ai/claude-agent-sdk";

export const Message = Typed<SDKMessage>();
export const SessionInfo = Typed<SDKSessionInfo>();
export const SessionMsg = Typed<SessionMessage>();

export const ChatParams = Typed<{
  prompt: string;
  options?: QueryOptions;
}>();
export const ListSessionsParams = Typed<ListSessionsOptions>();
export const GetSessionMessagesParams = Typed<
  GetSessionMessagesOptions & { sessionId: string }
>();
