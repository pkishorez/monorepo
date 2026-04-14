import { Effect, Schema } from "effect";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AppError } from "../definitions/app.js";
import { GitRpcs } from "../definitions/git.js";
import { CodexOrchestrator } from "../../agents/codex/codex.js";

const execFilePromise = promisify(execFile);

export const GitHandlers = GitRpcs.toLayer(
  GitRpcs.of({
    "git.getDiff": ({ absolutePath, statsOnly }) =>
      Effect.tryPromise({
        try: async () => {
          const { stdout: repoRoot } = await execFilePromise(
            "git",
            ["rev-parse", "--show-toplevel"],
            { cwd: absolutePath },
          );
          const cwd = repoRoot.trim();
          const [, { stdout: rawBranch }] = await Promise.all([
            execFilePromise("git", ["add", "-A", "--intent-to-add"], { cwd }),
            execFilePromise("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd }),
          ]);
          const branch = rawBranch.trim();
          if (statsOnly) {
            const { stdout: names } = await execFilePromise(
              "git",
              ["diff", "HEAD", "--name-only", "--no-color"],
              { cwd },
            );
            const trimmed = names.trim();
            const fileCount = trimmed ? trimmed.split("\n").length : 0;
            return { patch: "", fileCount, branch };
          }
          const { stdout: patch } = await execFilePromise(
            "git",
            ["diff", "HEAD", "--patch", "--minimal", "--no-color"],
            { cwd, maxBuffer: 10 * 1024 * 1024 },
          );
          return { patch, fileCount: 0, branch };
        },
        catch: (e) => new AppError({ message: String(e) }),
      }).pipe(
        Effect.withSpan("rpc.git.getDiff", { attributes: { absolutePath } }),
      ),
    "git.commit": ({ absolutePath, message }) =>
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
      }).pipe(
        Effect.withSpan("rpc.git.commit", { attributes: { absolutePath } }),
      ),
    "git.generateCommitMessage": ({ absolutePath, patch }) =>
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
        Effect.withSpan("rpc.git.generateCommitMessage", { attributes: { absolutePath } }),
      ),
    "git.listBranches": ({ absolutePath }) =>
      Effect.tryPromise({
        try: async () => {
          const { stdout: repoRoot } = await execFilePromise(
            "git",
            ["rev-parse", "--show-toplevel"],
            { cwd: absolutePath },
          );
          const cwd = repoRoot.trim();
          const { stdout } = await execFilePromise(
            "git",
            ["branch", "--no-color"],
            { cwd },
          );
          let current = "";
          const branches: string[] = [];
          for (const line of stdout.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (trimmed.startsWith("* ")) {
              const name = trimmed.slice(2);
              current = name;
              branches.push(name);
            } else {
              branches.push(trimmed);
            }
          }
          return { current, branches };
        },
        catch: (e) => new AppError({ message: String(e) }),
      }).pipe(
        Effect.withSpan("rpc.git.listBranches", { attributes: { absolutePath } }),
      ),
    "git.checkoutBranch": ({ absolutePath, branch, create }) =>
      Effect.tryPromise({
        try: async () => {
          const { stdout: repoRoot } = await execFilePromise(
            "git",
            ["rev-parse", "--show-toplevel"],
            { cwd: absolutePath },
          );
          const cwd = repoRoot.trim();
          const args = create
            ? ["checkout", "-b", branch]
            : ["checkout", branch];
          await execFilePromise("git", args, { cwd });
          return { branch, created: create };
        },
        catch: (e) => new AppError({ message: String(e) }),
      }).pipe(
        Effect.withSpan("rpc.git.checkoutBranch", { attributes: { absolutePath, branch } }),
      ),
  }),
);
