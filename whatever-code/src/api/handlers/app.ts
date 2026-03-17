import { Effect, Stream } from "effect";
import { spawn } from "node:child_process";
import { platform } from "node:os";
import { v7 } from "uuid";
import { listSessions } from "@anthropic-ai/claude-agent-sdk";
import { AppError, AppRpcs } from "../definitions/app.js";
import { BroadcastService } from "../../services/broadcast.js";
import { dataDir } from "../../db/index.js";
import {
  claudeSessionSqliteEntity,
  projectSqliteEntity,
} from "../../db/claude.js";
import { computePaths } from "../../lib/paths.js";

const openCommand =
  platform() === "darwin"
    ? "open"
    : platform() === "win32"
      ? "explorer"
      : "xdg-open";

export const AppHandlers = AppRpcs.toLayer(
  AppRpcs.of({
    "app.subscribe": () =>
      Stream.unwrap(BroadcastService.pipe(Effect.map((v) => v.subscribe))),
    "app.revealDataFolder": () =>
      Effect.sync(() => {
        spawn(openCommand, [dataDir], {
          detached: true,
          stdio: "ignore",
        }).unref();
      }),
    "app.openProject": ({ absolutePath }) =>
      Effect.gen(function* () {
        const existing = yield* projectSqliteEntity
          .get({ id: absolutePath })
          .pipe(Effect.orDie);

        if (existing?.value.sessionId) {
          return existing;
        }

        const sessionId = v7();
        yield* claudeSessionSqliteEntity
          .insert({
            id: sessionId,
            status: "success",
            sdkSessionCreated: false,
            absolutePath,
            name: "",
          })
          .pipe(Effect.orDie);

        if (existing) {
          yield* projectSqliteEntity
            .update({ id: absolutePath }, { sessionId, status: "idle" })
            .pipe(Effect.orDie);
        } else {
          const paths = computePaths(absolutePath);
          yield* projectSqliteEntity
            .insert({
              id: absolutePath,
              name: paths.gitPath,
              homePath: paths.homePath,
              gitPath: paths.gitPath,
              agentType: "claude",
              sessionId,
              status: "idle",
            })
            .pipe(Effect.orDie);
        }

        const project = yield* projectSqliteEntity
          .get({ id: absolutePath })
          .pipe(Effect.orDie);
        if (!project) {
          return yield* Effect.fail(
            new AppError({ message: "failed to retrieve project" }),
          );
        }
        return project;
      }).pipe(Effect.mapError((e) => new AppError({ message: String(e) }))),
    "app.queryProjects": ({ ">": cursor }) =>
      projectSqliteEntity
        .query("byUpdatedAt", { pk: {}, sk: { ">": cursor } })
        .pipe(
          Effect.map(({ items }) => items),
          Effect.mapError((e) => new AppError({ message: String(e) })),
        ),
    "app.discoverProjects": () =>
      Effect.tryPromise({
        try: () => listSessions(),
        catch: (e) => new AppError({ message: String(e) }),
      }).pipe(
        Effect.map((sessions) => {
          const counts = new Map<string, number>();
          for (const s of sessions) {
            if (s.cwd) counts.set(s.cwd, (counts.get(s.cwd) ?? 0) + 1);
          }
          return [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([cwd, sessionCount]) => ({
              ...computePaths(cwd),
              sessionCount,
            }));
        }),
      ),
  }),
);
