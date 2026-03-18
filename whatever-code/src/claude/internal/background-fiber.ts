import {
  query,
  getSessionInfo,
  type Options as QueryOptions,
} from "@anthropic-ai/claude-agent-sdk";
import { Cause, Effect, Exit, Queue, Stream } from "effect";
import { ulid } from "ulid";
import {
  claudeMessageSqliteEntity,
  claudeSessionSqliteEntity,
  claudeTurnSqliteEntity,
  projectSqliteEntity,
} from "../../db/claude.js";
import type { ActiveTurn } from "../schema.js";

const updateProjectStatus = (
  sessionId: string,
  status: "idle" | "active" | "error",
) =>
  projectSqliteEntity
    .query("bySessionId", { pk: { sessionId }, sk: { ">": null } })
    .pipe(
      Effect.flatMap(({ items }) => {
        const project = items[0];
        if (!project) return Effect.void;
        return projectSqliteEntity
          .update({ id: project.value.id }, { status })
          .pipe(Effect.asVoid);
      }),
      Effect.orDie,
    );

export const startBackgroundFiber = (
  activeTurns: Map<string, ActiveTurn>,
  sessionId: string,
  turn: ActiveTurn,
  prompt: string,
  queryOptions?: QueryOptions,
) => {
  const queryResult = query({
    prompt,
    options: {
      ...queryOptions,
      permissionMode: queryOptions?.permissionMode ?? "acceptEdits",
      ...(queryOptions?.permissionMode === "bypassPermissions"
        ? { allowDangerouslySkipPermissions: true }
        : {}),
      abortController: turn.abortController,
    },
  });

  const processMessage = (
    message: typeof queryResult extends AsyncGenerator<infer T> ? T : never,
  ) =>
    Effect.gen(function* () {
      const turnId = turn.turnId;

      yield* claudeMessageSqliteEntity
        .insert({ id: ulid(), sessionId, turnId, data: message })
        .pipe(Effect.orDie);

      yield* Queue.offer(turn.outputQueue, message);

      if (message.type === "system" && message.subtype === "init") {
        yield* Effect.log("session initialized").pipe(
          Effect.annotateLogs({ turnId }),
        );
        yield* claudeTurnSqliteEntity
          .update({ id: turnId }, { init: message })
          .pipe(Effect.orDie);
        yield* claudeSessionSqliteEntity
          .update({ id: sessionId }, { sdkSessionCreated: true })
          .pipe(Effect.orDie);
        yield* updateProjectStatus(sessionId, "active");
      } else if (message.type === "result") {
        const status = message.is_error ? "error" : "success";
        yield* Effect.log("turn completed").pipe(
          Effect.annotateLogs({ turnId, status }),
        );
        yield* claudeTurnSqliteEntity
          .update({ id: turnId }, { status, result: message })
          .pipe(Effect.orDie);
        yield* claudeSessionSqliteEntity
          .update({ id: sessionId }, { status })
          .pipe(Effect.orDie);

        yield* Effect.all(
          [
            Effect.tryPromise(() => getSessionInfo(sessionId)).pipe(
              Effect.flatMap((info) => {
                if (!info?.summary) return Effect.void;
                return claudeSessionSqliteEntity
                  .update({ id: sessionId }, { name: info.summary })
                  .pipe(Effect.orDie);
              }),
              Effect.catchAll(() => Effect.void),
            ),
            updateProjectStatus(
              sessionId,
              status === "error" ? "error" : "idle",
            ),
          ],
          { discard: true },
        );
        yield* Queue.shutdown(turn.outputQueue);
      }
    });

  return Effect.forkScoped(
    Stream.fromAsyncIterable(queryResult, (e) => new Error(String(e))).pipe(
      Stream.tap(processMessage),
      Stream.runDrain,
      Effect.onExit((exit) =>
        Effect.gen(function* () {
          yield* Queue.shutdown(turn.outputQueue);

          if (!activeTurns.has(sessionId)) return;
          activeTurns.delete(sessionId);

          if (Exit.isSuccess(exit)) {
            yield* Effect.log("background fiber exited cleanly");
            return;
          }

          if (Exit.isInterrupted(exit)) {
            yield* Effect.log("background fiber interrupted");
            yield* Effect.all(
              [
                claudeTurnSqliteEntity
                  .update({ id: turn.turnId }, { status: "interrupted" })
                  .pipe(Effect.orDie),
                claudeSessionSqliteEntity
                  .update({ id: sessionId }, { status: "interrupted" })
                  .pipe(Effect.orDie),
              ],
              { discard: true },
            );
            yield* updateProjectStatus(sessionId, "idle");
            return;
          }

          const cause = exit.pipe(Exit.causeOption);
          yield* Effect.logError("background fiber failed").pipe(
            Effect.annotateLogs({
              cause:
                cause._tag === "Some" ? Cause.pretty(cause.value) : "unknown",
            }),
          );
          yield* Effect.all(
            [
              claudeTurnSqliteEntity
                .update({ id: turn.turnId }, { status: "error" })
                .pipe(Effect.orDie),
              claudeSessionSqliteEntity
                .update({ id: sessionId }, { status: "error" })
                .pipe(Effect.orDie),
            ],
            { discard: true },
          );
          yield* updateProjectStatus(sessionId, "error");
        }),
      ),
      Effect.withSpan("claude.backgroundFiber", {
        attributes: { sessionId },
      }),
    ),
  );
};
