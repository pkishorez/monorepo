import { Effect, Schema } from "effect";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { dataDir } from "../db/layer.js";

const execFilePromise = promisify(execFile);

export class WorktreeError extends Schema.TaggedError<WorktreeError>()(
  "WorktreeError",
  { message: Schema.String },
) {}

const sanitizeBranch = (branch: string) =>
  branch.replace(/[^a-zA-Z0-9._-]/g, "-");

const computeWorktreePath = (repoPath: string, branch: string) => {
  const projectHash = createHash("sha256")
    .update(repoPath)
    .digest("hex")
    .slice(0, 12);
  return join(dataDir, "worktrees", projectHash, sanitizeBranch(branch));
};

export class WorktreeService extends Effect.Service<WorktreeService>()(
  "WorktreeService",
  {
    effect: Effect.succeed({
      create: ({
        repoPath,
        branch,
        baseBranch,
      }: {
        repoPath: string;
        branch: string;
        baseBranch?: string;
      }) =>
        Effect.gen(function* () {
          const worktreePath = computeWorktreePath(repoPath, branch);
          const base = baseBranch ?? "HEAD";

          // Try creating with a new branch first
          yield* Effect.tryPromise({
            try: () =>
              execFilePromise(
                "git",
                ["worktree", "add", "-b", branch, worktreePath, base],
                { cwd: repoPath },
              ),
            catch: (e) => e as Error & { stderr?: string },
          }).pipe(
            Effect.catchIf(
              (e) =>
                typeof e.stderr === "string" &&
                e.stderr.includes("already exists"),
              // Branch exists — attach to it without -b
              () =>
                Effect.tryPromise({
                  try: () =>
                    execFilePromise(
                      "git",
                      ["worktree", "add", worktreePath, branch],
                      { cwd: repoPath },
                    ),
                  catch: (e) => e as Error & { stderr?: string },
                }),
            ),
            Effect.mapError(
              (e) =>
                new WorktreeError({
                  message:
                    typeof e.stderr === "string" ? e.stderr.trim() : e.message,
                }),
            ),
          );

          return { worktreePath, branch };
        }),

      remove: ({ worktreePath }: { worktreePath: string }) =>
        Effect.tryPromise({
          try: () =>
            execFilePromise("git", [
              "worktree",
              "remove",
              "--force",
              worktreePath,
            ]),
          catch: (e) => e as Error & { stderr?: string },
        }).pipe(
          // Swallow "not a valid worktree" for idempotency
          Effect.catchIf(
            (e) =>
              typeof e.stderr === "string" &&
              e.stderr.includes("is not a working tree"),
            () => Effect.void,
          ),
          Effect.mapError(
            (e) =>
              new WorktreeError({
                message:
                  typeof e.stderr === "string" ? e.stderr.trim() : e.message,
              }),
          ),
          Effect.asVoid,
        ),
    }),
  },
) {}
