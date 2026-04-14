import { execFile } from "node:child_process";
import { Effect, Runtime } from "effect";
import { v7 } from "uuid";
import { ClaudeChatError } from "../../api/definitions/claude.js";
import { sessionSqliteEntity } from "../../db/entities/session.js";
import { updateSessionPayload } from "../shared/session.js";
import { deriveSessionName } from "../shared/session-name.js";
import { makeSessionManager } from "./claude-session.js";
import type { SessionRuntimeOptions } from "./internal/index.js";
import { SqliteDB } from "@std-toolkit/sqlite";

type SessionManager = ReturnType<typeof makeSessionManager>;
import {
  ContinueSessionParams,
  CreateSessionParams,
  RespondToToolParams,
  UpdateSessionParams,
} from "./schema.js";
import { initSessions } from "./utils.js";

export class ClaudeOrchestrator extends Effect.Service<ClaudeOrchestrator>()(
  "ClaudeOrchestrator",
  {
    scoped: Effect.gen(function* () {
      const sessions = new Map<string, SessionManager>();
      const runtime = yield* Effect.runtime<SqliteDB>();
      const fork = <A, E>(effect: Effect.Effect<A, E, any>) =>
        Runtime.runFork(runtime)(effect as Effect.Effect<A, E, SqliteDB>);

      yield* initSessions;

      yield* Effect.addFinalizer(() =>
        Effect.forEach(sessions.values(), (s) => s.stop(), { discard: true }),
      );

      const getOrCreate = (sessionId: string): SessionManager => {
        let session = sessions.get(sessionId);
        if (!session) {
          session = makeSessionManager({ sessionId, runtime, fork });
          sessions.set(sessionId, session);
        }
        return session;
      };

      const createSession = (
        params: typeof CreateSessionParams.Type,
        runtimeOptions?: SessionRuntimeOptions,
      ) =>
        Effect.gen(function* () {
          const sessionId = v7();
          yield* Effect.annotateCurrentSpan("sessionId", sessionId);

          yield* sessionSqliteEntity
            .insert({
              sessionId,
              type: "claude",
              status: "success",
              absolutePath: params.absolutePath,
              name: deriveSessionName(params.prompt),
              model: params.model,
              interactionMode: params.interactionMode ?? "default",
              payload: {
                type: "claude",
                accessMode: "full-access",
                persistSession: params.persistSession,
                effort: params.effort,
                maxTurns: params.maxTurns,
                maxBudgetUsd: params.maxBudgetUsd,
              },
            })
            .pipe(Effect.orDie);

          const session = getOrCreate(sessionId);
          fork(
            session.continue(params.prompt, runtimeOptions).pipe(
              Effect.catchAll((error) =>
                Effect.logError("createSession: forked turn failed").pipe(
                  Effect.annotateLogs({ sessionId, error: String(error) }),
                  Effect.flatMap(() =>
                    sessionSqliteEntity
                      .update({ sessionId }, { status: "error" })
                      .pipe(Effect.orDie, Effect.asVoid),
                  ),
                ),
              ),
            ),
          );

          yield* Effect.log("claude: session created").pipe(
            Effect.annotateLogs({ sessionId }),
          );
          return sessionId;
        }).pipe(
          Effect.mapError(
            (e) => new ClaudeChatError({ message: String(e) }),
          ),
          Effect.withSpan("claude.createSession", { attributes: { model: params.model } }),
        );

      const continueSession = (
        params: typeof ContinueSessionParams.Type,
        runtimeOptions?: SessionRuntimeOptions,
      ) =>
        Effect.gen(function* () {
          const session = getOrCreate(params.sessionId);
          yield* session.continue(params.prompt, runtimeOptions);
        }).pipe(
          Effect.mapError((e) =>
            e instanceof ClaudeChatError
              ? e
              : new ClaudeChatError({ message: String(e) }),
          ),
          Effect.withSpan("claude.continueSession", { attributes: { sessionId: params.sessionId } }),
        );

      const stopSession = (sessionId: string) =>
        Effect.gen(function* () {
          const session = sessions.get(sessionId);
          if (!session) return;
          yield* session.stop();
          sessions.delete(sessionId);
        }).pipe(
          Effect.withSpan("claude.stopSession", { attributes: { sessionId } }),
        );

      const respondToTool = (params: typeof RespondToToolParams.Type) =>
        Effect.gen(function* () {
          const session = sessions.get(params.sessionId);
          if (!session) {
            return yield* Effect.fail(
              new ClaudeChatError({
                message: `Session ${params.sessionId} not found`,
              }),
            );
          }
          yield* session.respondToUserQuestion(
            params.toolUseId,
            params.response,
          );
        }).pipe(
          Effect.mapError((e) =>
            e instanceof ClaudeChatError
              ? e
              : new ClaudeChatError({ message: String(e) }),
          ),
          Effect.withSpan("claude.respondToTool", {
            attributes: { sessionId: params.sessionId, toolUseId: params.toolUseId },
          }),
        );

      const updateSession = (params: typeof UpdateSessionParams.Type) =>
        updateSessionPayload(params.sessionId, "claude", params.updates).pipe(
          Effect.withSpan("claude.updateSession", { attributes: { sessionId: params.sessionId } }),
        );

      const oneShot = (params: {
        cwd: string;
        prompt: string;
        model?: string;
      }) =>
        Effect.tryPromise({
          try: async () => {
            const args = [
              "-p",
              "--no-session-persistence",
              "--output-format",
              "text",
              "--tools",
              "",
              ...(params.model ? ["--model", params.model] : []),
              "-",
            ];
            const stdout = await new Promise<string>((resolve, reject) => {
              const child = execFile(
                "claude",
                args,
                {
                  cwd: params.cwd,
                  timeout: 60_000,
                  maxBuffer: 1024 * 1024,
                  env: { ...process.env },
                },
                (error, out) => {
                  if (error) return reject(error);
                  resolve(String(out));
                },
              );
              child.stdin?.end(params.prompt);
            });
            return stdout.trim();
          },
          catch: (e) =>
            new ClaudeChatError({
              message: e instanceof Error ? e.message : String(e),
            }),
        }).pipe(
          Effect.withSpan("claude.oneShot", { attributes: { cwd: params.cwd } }),
        );

      return {
        createSession,
        continueSession,
        stopSession,
        updateSession,
        respondToTool,
        oneShot,
      };
    }),
  },
) {}
