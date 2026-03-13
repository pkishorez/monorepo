import {
  getSessionMessages,
  listSessions,
} from "@anthropic-ai/claude-agent-sdk";
import { Effect, Stream } from "effect";
import { ClaudeChatError, ClaudeRpcs } from "../definitions/claude.js";
import { ClaudeOrchestrator } from "../../claude/index.js";

export const ClaudeHandlers = ClaudeRpcs.toLayer(
  ClaudeRpcs.of({
    "claude.chat": (params) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const orchestrator = yield* ClaudeOrchestrator;
          return orchestrator.chat(params);
        }),
      ),
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
    "claude.interrupt": ({ sessionId }) =>
      Effect.gen(function* () {
        const orchestrator = yield* ClaudeOrchestrator;
        yield* orchestrator.interrupt(sessionId);
      }),
    "claude.stop": ({ sessionId }) =>
      Effect.gen(function* () {
        const orchestrator = yield* ClaudeOrchestrator;
        yield* orchestrator.stop(sessionId);
      }),
  }),
);
