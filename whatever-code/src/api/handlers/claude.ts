import {
  getSessionMessages,
  listSessions,
  query,
} from "@anthropic-ai/claude-agent-sdk";
import { Effect, Stream } from "effect";
import { ClaudeChatError, ClaudeRpcs } from "../definitions/claude.js";
import { claudeMessageSqliteEntity } from "../../db/claude.js";
import { v7 } from "uuid";
import { ulid } from "ulid";

export const ClaudeHandlers = ClaudeRpcs.toLayer(
  ClaudeRpcs.of({
    "claude.chat": (params) => {
      const sessionId = params.sessionId ?? v7();
      const result = query({
        prompt: params.prompt,
        options: {
          sessionId,
        },
      });
      return Stream.fromAsyncIterable(
        result,
        (error) => new ClaudeChatError({ message: String(error) }),
      ).pipe(
        Stream.tap(
          Effect.fn(function* (message) {
            yield* claudeMessageSqliteEntity
              .insert({
                id: ulid(),
                sessionId,
                data: message,
              })
              .pipe(Effect.orDie);
          }),
        ),
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
