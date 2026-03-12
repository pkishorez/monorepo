import {
  getSessionMessages,
  listSessions,
  query,
} from "@anthropic-ai/claude-agent-sdk";
import { Effect, Stream } from "effect";
import { ClaudeChatError, ClaudeRpcs } from "../definitions/claude.js";

export const ClaudeHandlers = ClaudeRpcs.toLayer(
  ClaudeRpcs.of({
    "claude.chat": (params) => {
      const result = query(params);
      return Stream.fromAsyncIterable(
        result,
        (error) => new ClaudeChatError({ message: String(error) }),
      );
    },
    "claude.listSessions": (params) =>
      Effect.tryPromise({
        try: () => listSessions(params),
        catch: (error) => new ClaudeChatError({ message: String(error) }),
      }),
    "claude.getSessionMessages": ({ sessionId, ...options }) =>
      Effect.tryPromise({
        try: () => getSessionMessages(sessionId, options),
        catch: (error) => new ClaudeChatError({ message: String(error) }),
      }),
  }),
);
