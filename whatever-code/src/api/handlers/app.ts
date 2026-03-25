import { Effect, Schema, Stream } from "effect";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { platform } from "node:os";
import { listSessions } from "@anthropic-ai/claude-agent-sdk";
import { AppError, AppRpcs } from "../definitions/app.js";
import { CodexOrchestrator } from "../../codex/codex.js";
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
    "app.getGitDiff": ({ absolutePath }) =>
      Effect.tryPromise({
        try: async () => {
          const { stdout: repoRoot } = await execFilePromise(
            "git",
            ["rev-parse", "--show-toplevel"],
            { cwd: absolutePath },
          );
          const cwd = repoRoot.trim();
          await execFilePromise(
            "git",
            ["add", "-A", "--intent-to-add"],
            { cwd },
          );
          const { stdout: patch } = await execFilePromise(
            "git",
            ["diff", "HEAD", "--patch", "--minimal", "--no-color"],
            { cwd, maxBuffer: 10 * 1024 * 1024 },
          );
          return { patch };
        },
        catch: (e) => new AppError({ message: String(e) }),
      }),
    "app.gitCommit": ({ absolutePath, message }) =>
      Effect.tryPromise({
        try: async () => {
          await execFilePromise("git", ["add", "-A"], { cwd: absolutePath });
          await execFilePromise("git", ["commit", "-m", message], {
            cwd: absolutePath,
          });
          const { stdout } = await execFilePromise(
            "git",
            ["log", "-1", "--oneline"],
            { cwd: absolutePath },
          );
          const line = stdout.trim();
          const spaceIdx = line.indexOf(" ");
          return {
            hash: spaceIdx > 0 ? line.slice(0, spaceIdx) : line,
            summary: spaceIdx > 0 ? line.slice(spaceIdx + 1) : line,
          };
        },
        catch: (e) => new AppError({ message: String(e) }),
      }),
    "app.generateCommitMessage": ({ absolutePath, patch }) =>
      Effect.gen(function* () {
        const codex = yield* CodexOrchestrator;
        const prompt = [
          "You write concise git commit messages.",
          "Return a JSON object with keys: subject, body.",
          "Rules:",
          "- subject must be imperative, <= 72 chars, and no trailing period",
          "- body can be empty string or short bullet points",
          "- capture the primary user-visible or developer-visible change",
          "",
          "Diff:",
          patch.length > 40_000 ? patch.slice(0, 40_000) + "\n\n[truncated]" : patch,
        ].join("\n");

        const result = yield* codex.oneShotJson({
          cwd: absolutePath,
          prompt,
          schema: Schema.Struct({
            subject: Schema.String,
            body: Schema.String,
          }),
        });

        const raw = result.subject.trim().split(/\r?\n/g)[0]?.trim() ?? "";
        const cleaned = raw.replace(/[.]+$/g, "").trim();
        const subject =
          cleaned.length === 0
            ? "Update project files"
            : cleaned.length <= 72
              ? cleaned
              : cleaned.slice(0, 72).trimEnd();

        return { subject, body: result.body.trim() };
      }).pipe(
        Effect.mapError((e) => new AppError({ message: String(e) })),
      ),
  }),
);
