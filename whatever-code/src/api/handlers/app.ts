import { Effect, Stream } from "effect";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { platform } from "node:os";
import { listSessions } from "@anthropic-ai/claude-agent-sdk";
import { AppError, AppRpcs } from "../definitions/app.js";
import { BroadcastService } from "../../services/broadcast.js";
import { dataDir } from "../../db/index.js";
import { projectSqliteEntity } from "../../db/claude.js";
import { computePaths } from "../../lib/paths.js";

const execFilePromise = promisify(execFile);

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

        if (existing) {
          return existing;
        }

        const paths = computePaths(absolutePath);
        return yield* projectSqliteEntity
          .insert({
            id: absolutePath,
            name: paths.gitPath,
            homePath: paths.homePath,
            gitPath: paths.gitPath,
            agentType: "claude",
            sessionId: null,
            status: "idle",
          })
          .pipe(Effect.orDie);
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
    "app.switchSession": ({ absolutePath, sessionId }) =>
      projectSqliteEntity
        .update({ id: absolutePath }, { sessionId, status: "idle" })
        .pipe(Effect.mapError((e) => new AppError({ message: String(e) }))),
    "app.getProjectFiles": ({ absolutePath }) =>
      Effect.tryPromise({
        try: () =>
          execFilePromise(
            "git",
            ["ls-files", "--cached", "--others", "--exclude-standard"],
            { cwd: absolutePath },
          ),
        catch: (e) => new AppError({ message: String(e) }),
      }).pipe(
        Effect.map(({ stdout }) => {
          const files = stdout.trim().split("\n").filter(Boolean);
          const dirs = new Set<string>();
          for (const file of files) {
            let i = file.indexOf("/");
            while (i !== -1) {
              dirs.add(file.slice(0, i + 1));
              i = file.indexOf("/", i + 1);
            }
          }
          return [...dirs].sort().concat(files);
        }),
      ),
  }),
);
