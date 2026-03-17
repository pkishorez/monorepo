import type {
  Options as QueryOptions,
  SDKMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { Effect, Queue } from "effect";
import type { ActiveSession } from "../schema.js";
import { startBackgroundFiber } from "./background-fiber.js";

export const initSession = (
  activeSessions: Map<string, ActiveSession>,
) =>
  (
    sessionId: string,
    turnId: string,
    userMessage: SDKUserMessage,
    queryOptions?: QueryOptions,
  ) =>
    Effect.gen(function* () {
      yield* Effect.log("initializing new session");
      const inputQueue = yield* Queue.unbounded<SDKUserMessage>();
      const outputQueue = yield* Queue.unbounded<SDKMessage>();
      const session: ActiveSession = {
        abortController: new AbortController(),
        inputQueue,
        outputQueue,
        turnId,
        lastActivityAt: Date.now(),
      };
      activeSessions.set(sessionId, session);
      yield* Queue.offer(inputQueue, userMessage);
      yield* startBackgroundFiber(
        activeSessions,
        sessionId,
        session,
        queryOptions,
      );
      yield* Effect.log("background fiber started");
    }).pipe(
      Effect.withSpan("claude.initSession", {
        attributes: { sessionId, turnId },
      }),
    );

export type InitSession = ReturnType<typeof initSession>;
