import type {
  SDKMessage,
  Options as QueryOptions,
} from "@anthropic-ai/claude-agent-sdk";
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
      if (!params.sessionId) {
        return yield* Effect.fail(
          new ClaudeChatError({
            message: "sessionId is required to continue a session",
          }),
        );
      }

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
      const storedPermissionMode = dbSession?.value.permissionMode;
      const sdkCreated = dbSession?.value.sdkSessionCreated ?? false;
      const absolutePath = dbSession?.value.absolutePath;

      const outputQueue = yield* Queue.unbounded<SDKMessage>();
      const turn: ActiveTurn = {
        abortController: new AbortController(),
        outputQueue,
        turnId,
      };
      activeTurns.set(params.sessionId, turn);

      const options: QueryOptions = {
        ...params.options,
        ...(storedModel !== undefined ? { model: storedModel } : {}),
        ...(sdkCreated
          ? { resume: params.sessionId }
          : { sessionId: params.sessionId }),
        ...(absolutePath !== undefined ? { cwd: absolutePath } : {}),
      };
      if (storedPermissionMode !== undefined) {
        options.permissionMode = storedPermissionMode;
      }

      yield* startBackgroundFiber(
        activeTurns,
        params.sessionId,
        turn,
        params.prompt,
        options,
      );
    }).pipe(
      Effect.withSpan("claude.continueSession", {
        attributes: { sessionId: params.sessionId },
      }),
    );
