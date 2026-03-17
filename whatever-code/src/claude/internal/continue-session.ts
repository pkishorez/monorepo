import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { Effect, Queue } from "effect";
import { ulid } from "ulid";
import { ClaudeChatError } from "../../api/definitions/claude.js";
import { claudeSessionSqliteEntity } from "../../db/claude.js";
import { ContinueSessionParams, type ActiveSession } from "../schema.js";
import type { InitSession } from "./init-session.js";
import { makeUserMessage, persistNewTurn } from "./helpers.js";

const STALE_SESSION_MS = 5 * 60 * 1000;

const teardownStaleSession = (
  activeSessions: Map<string, ActiveSession>,
  sessionId: string,
  session: ActiveSession,
) =>
  Effect.gen(function* () {
    yield* Effect.log("tearing down stale session");
    activeSessions.delete(sessionId);
    session.abortController.abort();
    yield* Queue.shutdown(session.inputQueue);
    yield* Queue.shutdown(session.outputQueue);
  });

export const continueSession = (
  activeSessions: Map<string, ActiveSession>,
  initSession: InitSession,
) =>
  (params: typeof ContinueSessionParams.Type) =>
    Effect.gen(function* () {
      const userMessage = makeUserMessage(params.sessionId, params.prompt);
      let existing = activeSessions.get(params.sessionId);
      const turnId = ulid();

      if (existing) {
        const isOutputDone = yield* Queue.isShutdown(existing.outputQueue);

        if (!isOutputDone) {
          yield* Effect.logWarning("rejecting continue — previous turn still active");
          return yield* Effect.fail(
            new ClaudeChatError({
              message: "previous turn did not finish yet",
            }),
          );
        }

        const idleMs = Date.now() - existing.lastActivityAt;
        if (idleMs > STALE_SESSION_MS) {
          yield* Effect.log("session exceeded stale threshold").pipe(
            Effect.annotateLogs({ idleMs }),
          );
          yield* teardownStaleSession(
            activeSessions,
            params.sessionId,
            existing,
          );
          existing = undefined;
        }
      }

      if (existing) {
        yield* Effect.log("continuing existing session");
        yield* persistNewTurn(params.sessionId, turnId, userMessage);
        existing.turnId = turnId;
        existing.outputQueue = yield* Queue.unbounded<SDKMessage>();
        existing.lastActivityAt = Date.now();

        if (existing.query) {
          const dbSession = yield* claudeSessionSqliteEntity
            .get({ id: params.sessionId })
            .pipe(Effect.orDie);
          if (dbSession?.value.model) {
            yield* Effect.tryPromise({
              try: () => existing.query!.setModel(dbSession.value.model!),
              catch: (e) => new ClaudeChatError({ message: String(e) }),
            });
          }
        }

        yield* Queue.offer(existing.inputQueue, userMessage);
        return;
      }

      yield* Effect.log("reinitializing session (no active session found)");
      yield* persistNewTurn(params.sessionId, turnId, userMessage);
      const dbSession = yield* claudeSessionSqliteEntity
        .get({ id: params.sessionId })
        .pipe(Effect.orDie);
      const storedModel = dbSession?.value.model;
      yield* initSession(params.sessionId, turnId, userMessage, {
        ...(storedModel !== undefined ? { model: storedModel } : {}),
        ...params.options,
        resume: params.sessionId,
      });
    }).pipe(
      Effect.withSpan("claude.continueSession", {
        attributes: { sessionId: params.sessionId },
      }),
    );
