import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { Effect, Queue } from "effect";
import { ulid } from "ulid";
import { ClaudeChatError } from "../../api/definitions/claude.js";
import { claudeSessionSqliteEntity } from "../../db/claude.js";
import { ContinueSessionParams, type ActiveTurn } from "../schema.js";
import { startBackgroundFiber } from "./background-fiber.js";
import { persistNewTurn } from "./helpers.js";

export const continueSession =
  (activeTurns: Map<string, ActiveTurn>) =>
  (params: typeof ContinueSessionParams.Type) =>
    Effect.gen(function* () {
      const existing = activeTurns.get(params.sessionId);

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
        activeTurns.delete(params.sessionId);
      }

      const turnId = ulid();
      yield* persistNewTurn(params.sessionId, turnId, params.prompt);

      const dbSession = yield* claudeSessionSqliteEntity
        .get({ id: params.sessionId })
        .pipe(Effect.orDie);
      const storedModel = dbSession?.value.model;
      const sdkCreated = dbSession?.value.sdkSessionCreated ?? false;

      const outputQueue = yield* Queue.unbounded<SDKMessage>();
      const turn: ActiveTurn = {
        abortController: new AbortController(),
        outputQueue,
        turnId,
      };
      activeTurns.set(params.sessionId, turn);

      yield* startBackgroundFiber(
        activeTurns,
        params.sessionId,
        turn,
        params.prompt,
        {
          ...(storedModel !== undefined ? { model: storedModel } : {}),
          ...params.options,
          ...(sdkCreated
            ? { resume: params.sessionId }
            : { sessionId: params.sessionId }),
        },
      );
    }).pipe(
      Effect.withSpan("claude.continueSession", {
        attributes: { sessionId: params.sessionId },
      }),
    );
