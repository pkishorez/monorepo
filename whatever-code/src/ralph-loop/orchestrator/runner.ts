import {
  createSdkMcpServer,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import { Effect, Runtime } from "effect";
import { z } from "zod";
import { ClaudeOrchestrator } from "../../agents/claude/claude.js";
import { WorktreeService } from "../../services/worktree.js";
import { ralphLoopSqliteEntity } from "../db/entities/ralph-loop.js";
import { ralphLoopTaskSqliteEntity } from "../db/entities/ralph-loop-task.js";
import { sessionSqliteEntity } from "../../db/entities/session.js";
import { turnSqliteEntity } from "../../db/entities/turn.js";
import { buildExecuteNextTaskPrompt } from "./prompt-builder.js";
import type { ralphLoopEntity } from "../entity/ralph-loop.js";
import type { ralphLoopTaskEntity } from "../entity/ralph-loop-task.js";

type RalphLoop = typeof ralphLoopEntity.Type;
type RalphLoopTask = typeof ralphLoopTaskEntity.Type;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const makeRunEffect = (runtime: Runtime.Runtime<never>) => {
  return <A>(effect: Effect.Effect<A, any, any>): Promise<A> =>
    Runtime.runPromise(runtime)(effect as Effect.Effect<A, never, never>);
};

export const getLoop = (id: string) =>
  ralphLoopSqliteEntity.get({ id }).pipe(
    Effect.orDie,
    Effect.flatMap((row) =>
      row
        ? Effect.succeed(row.value)
        : Effect.fail(new Error(`ralph loop ${id} not found`)),
    ),
  );

const getTasks = (ralphLoopId: string) =>
  ralphLoopTaskSqliteEntity
    .query("byRalphLoop", {
      pk: { ralphLoopId },
      sk: { ">": null },
    })
    .pipe(
      Effect.orDie,
      Effect.map(({ items }) =>
        items.filter((i) => !i.meta._d).map((i) => i.value),
      ),
    );

const setLoopStatus = (id: string, status: RalphLoop["status"]) =>
  ralphLoopSqliteEntity
    .update({ id }, { status })
    .pipe(Effect.orDie, Effect.asVoid);

const setTaskStatus = (id: string, status: RalphLoopTask["status"]) =>
  ralphLoopTaskSqliteEntity
    .update({ id }, { status })
    .pipe(Effect.orDie, Effect.asVoid);

// ---------------------------------------------------------------------------
// Execution MCP server (claimTask + taskDone)
// ---------------------------------------------------------------------------

/**
 * Creates an in-process MCP server that exposes `claimTask` and `taskDone`.
 *
 * - `claimTask`: The agent calls this to claim a pending task before starting
 *   work. Immediately persists the "running" status and session association
 *   so the UI reacts in real time.
 * - `taskDone`: The agent calls this when the task is fully complete.
 */
const makeExecutionMcpServer = (
  tasks: RalphLoopTask[],
  sessionIdRef: { current: string | null },
  runEffect: <A>(effect: Effect.Effect<A, any, any>) => Promise<A>,
  claimedTaskIdRef: { current: string | null },
  onTaskDone: (args: {
    taskId: string;
    outcome: string;
    learnings: string;
  }) => void,
) =>
  createSdkMcpServer({
    name: "ralph-loop-tools",
    version: "1.0.0",
    tools: [
      tool(
        "claimTask",
        "Call this tool to claim a pending task before you start working on it. You MUST call this before doing any implementation work. It marks the task as running.",
        {
          taskId: z
            .string()
            .describe("The id of the pending task you want to claim"),
        },
        async (args) => {
          if (claimedTaskIdRef.current !== null) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error: You already claimed task ${claimedTaskIdRef.current}. Finish it first by calling taskDone.`,
                },
              ],
              isError: true,
            };
          }

          const task = tasks.find((t) => t.id === args.taskId);
          if (!task) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error: Task ${args.taskId} not found. Available pending tasks: ${tasks
                    .filter((t) => t.status === "pending")
                    .map((t) => t.id)
                    .join(", ")}`,
                },
              ],
              isError: true,
            };
          }
          if (task.status === "completed") {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Task "${task.title}" is already completed. No-op.`,
                },
              ],
            };
          }
          if (task.status !== "pending") {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error: Task "${task.title}" is in "${task.status}" status, not "pending".`,
                },
              ],
              isError: true,
            };
          }

          await runEffect(
            Effect.gen(function* () {
              yield* setTaskStatus(args.taskId, "running");
              if (sessionIdRef.current) {
                yield* ralphLoopTaskSqliteEntity
                  .update(
                    { id: args.taskId },
                    { sessionId: sessionIdRef.current },
                  )
                  .pipe(Effect.orDie);
              }
            }),
          );

          claimedTaskIdRef.current = args.taskId;

          return {
            content: [
              {
                type: "text" as const,
                text: `Task "${task.title}" claimed. You are now working on it. Proceed with the implementation, then call taskDone when finished.`,
              },
            ],
          };
        },
      ),
      tool(
        "taskDone",
        "Call this tool when you have fully completed a task. Provide the taskId, a brief outcome summary, and any learnings that might help future tasks.",
        {
          taskId: z.string().describe("The id of the task you completed"),
          outcome: z
            .string()
            .describe("Brief summary of what was accomplished"),
          learnings: z
            .string()
            .describe(
              "Insights, gotchas, or context that would help when working on subsequent tasks",
            ),
        },
        async (args) => {
          const task = tasks.find((t) => t.id === args.taskId);
          if (!task) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error: Task ${args.taskId} not found.`,
                },
              ],
              isError: true,
            };
          }

          onTaskDone(args);
          return {
            content: [
              {
                type: "text" as const,
                text: `Task ${args.taskId} marked as done. The orchestrator will proceed to the next task.`,
              },
            ],
          };
        },
      ),
    ],
  });

// ---------------------------------------------------------------------------
// Wait for a session's turn to reach a terminal state
// ---------------------------------------------------------------------------

const waitForSessionCompletion = (sessionId: string) =>
  Effect.gen(function* () {
    // Polls every 3 seconds, up to 600 attempts (~30 min).
    let attempts = 0;
    const maxAttempts = 600;

    while (attempts < maxAttempts) {
      attempts++;

      const session = yield* sessionSqliteEntity
        .get({ sessionId })
        .pipe(Effect.orDie);
      if (!session) {
        return yield* Effect.fail(
          new Error(`Session ${sessionId} not found`),
        );
      }

      // Fast path: session-level status is already terminal.
      if (
        session.value.status === "success" ||
        session.value.status === "error" ||
        session.value.status === "interrupted"
      ) {
        return session.value.status;
      }

      const turns = yield* turnSqliteEntity
        .query("bySession", { pk: { sessionId }, sk: { ">": null } })
        .pipe(Effect.orDie);

      const activeTurns = turns.items
        .map((t) => t.value)
        .filter((t) => t.status !== "queued");

      if (activeTurns.length > 0) {
        const latest = activeTurns[activeTurns.length - 1]!;
        if (
          latest.status === "success" ||
          latest.status === "error" ||
          latest.status === "interrupted"
        ) {
          return latest.status;
        }
      }

      yield* Effect.sleep("3 seconds");
    }

    return yield* Effect.fail(new Error("Session timed out"));
  }).pipe(
    Effect.withSpan("ralphLoop.waitForSession", { attributes: { sessionId } }),
  );

// ---------------------------------------------------------------------------
// Worktree creation
// ---------------------------------------------------------------------------

export const createWorktreeForLoop = (
  loop: RalphLoop,
  repoPath: string,
) =>
  Effect.gen(function* () {
    const worktreeService = yield* WorktreeService;
    const branch = loop.branchName ?? `ralph-loop/${loop.id.slice(0, 8)}`;

    const result = yield* worktreeService.create({
      repoPath,
      branch,
      baseBranch: "main",
    });

    const worktreeMeta = {
      path: result.worktreePath,
      branch: result.branch,
      repoPath,
    };

    yield* ralphLoopSqliteEntity
      .update({ id: loop.id }, { worktree: worktreeMeta })
      .pipe(Effect.orDie);

    return worktreeMeta;
  }).pipe(
    Effect.withSpan("ralphLoop.createWorktree", { attributes: { ralphLoopId: loop.id } }),
  );

// ---------------------------------------------------------------------------
// Execute next task (single session that picks + executes)
// ---------------------------------------------------------------------------

/**
 * Creates a single session that picks the best pending task, claims it via
 * the `claimTask` tool, executes the work, and reports completion via
 * `taskDone`.
 */
const executeNextTask = (
  loop: RalphLoop,
  tasks: RalphLoopTask[],
  worktreePath: string,
) =>
  Effect.gen(function* () {
    const claude = yield* ClaudeOrchestrator;
    const runtime = yield* Effect.runtime<never>();
    const runEffect = makeRunEffect(runtime);

    const prompt = buildExecuteNextTaskPrompt(loop, tasks);

    // Mutable refs for tool callbacks
    const claimedTaskIdRef: { current: string | null } = { current: null };
    let taskDoneResult: {
      taskId: string;
      outcome: string;
      learnings: string;
    } | null = null;
    const sessionIdRef: { current: string | null } = { current: null };

    const mcpServer = makeExecutionMcpServer(
      tasks,
      sessionIdRef,
      runEffect,
      claimedTaskIdRef,
      (args) => {
        taskDoneResult = args;
      },
    );

    const sessionId = yield* claude.createSession(
      {
        absolutePath: worktreePath,
        prompt,
        model: loop.model ?? "claude-sonnet-4-6",
        interactionMode: "default",
        persistSession: false,
        effort: "high",
        maxTurns: 200,
        maxBudgetUsd: 5,
      },
      {
        systemPrompt: {
          type: "preset",
          preset: "claude_code",
          append: [
            "",
            "IMPORTANT: You have access to `claimTask` and `taskDone` MCP tools.",
            "1. Review the task list and pick the best pending task.",
            "2. Call `claimTask` with the taskId to claim it before starting work.",
            "3. Implement the task fully.",
            "4. Call `taskDone` with the taskId, outcome, and learnings when finished.",
            "",
            "You MUST call `taskDone` when the task is complete. Calling `claimTask` first is recommended so the UI shows progress, but `taskDone` is what matters.",
          ].join("\n"),
        },
        mcpServers: {
          "ralph-loop-tools": mcpServer,
        },
      },
    );

    // Set the ref so claimTask can associate the session with the task
    sessionIdRef.current = sessionId;

    // Store activeSessionId on the loop so the UI can show it
    yield* ralphLoopSqliteEntity
      .update({ id: loop.id }, { activeSessionId: sessionId })
      .pipe(Effect.orDie);

    yield* waitForSessionCompletion(sessionId);

    return {
      sessionId,
      claimedTaskId: claimedTaskIdRef.current,
      taskDoneResult,
    };
  }).pipe(
    Effect.withSpan("ralphLoop.executeTask", {
      attributes: { ralphLoopId: loop.id, taskCount: tasks.length },
    }),
  );

// ---------------------------------------------------------------------------
// Main orchestrator loop
// ---------------------------------------------------------------------------

/**
 * Starts the autonomous execution loop for a Ralph Loop.
 *
 * For each iteration a single session is created that:
 * 1. Picks the best pending task and claims it via `claimTask`
 * 2. Executes the task
 * 3. Reports completion via `taskDone`
 *
 * On any task failure the loop stops immediately (status → failed).
 */
export const startRalphLoopExecution = (ralphLoopId: string) =>
  Effect.gen(function* () {
    let loop = yield* getLoop(ralphLoopId);

    if (!loop.worktree) {
      return yield* Effect.fail(
        new Error("Worktree must be created before starting execution"),
      );
    }

    yield* setLoopStatus(ralphLoopId, "executing");

    const worktreePath = loop.worktree.path;

    while (true) {
      loop = yield* getLoop(ralphLoopId);
      if (loop.status === "cancelled") {
        break;
      }

      const tasks = yield* getTasks(ralphLoopId);
      const pendingTasks = tasks.filter((t) => t.status === "pending");

      if (pendingTasks.length === 0) {
        yield* setLoopStatus(ralphLoopId, "completed");
        yield* Effect.log("ralphLoop: all tasks done").pipe(
          Effect.annotateLogs({ ralphLoopId }),
        );
        break;
      }

      yield* Effect.log("Starting next task session").pipe(
        Effect.annotateLogs({
          ralphLoopId,
          pendingCount: pendingTasks.length,
        }),
      );

      const result = yield* executeNextTask(
        loop,
        tasks,
        worktreePath,
      ).pipe(
        Effect.catchAll(() =>
          Effect.succeed({
            sessionId: null as string | null,
            claimedTaskId: null as string | null,
            taskDoneResult: null as {
              taskId: string;
              outcome: string;
              learnings: string;
            } | null,
          }),
        ),
      );

      if (result.taskDoneResult) {
        const { taskId, outcome, learnings } = result.taskDoneResult;
        yield* ralphLoopTaskSqliteEntity
          .update(
            { id: taskId },
            { status: "completed", outcome, learnings },
          )
          .pipe(Effect.orDie);

        yield* Effect.log(`Task completed: "${taskId}"`).pipe(
          Effect.annotateLogs({ taskId, ralphLoopId }),
        );
      } else if (result.claimedTaskId) {
        yield* setTaskStatus(result.claimedTaskId, "failed");
        yield* setLoopStatus(ralphLoopId, "failed");

        yield* Effect.logError(
          `Task failed: claimed task ${result.claimedTaskId} — session ended without calling taskDone`,
        ).pipe(
          Effect.annotateLogs({
            taskId: result.claimedTaskId,
            ralphLoopId,
          }),
        );
        break;
      } else {
        yield* setLoopStatus(ralphLoopId, "failed");

        yield* Effect.logError(
          "Execution session failed — no task was claimed",
        ).pipe(Effect.annotateLogs({ ralphLoopId }));
        break;
      }

      yield* ralphLoopSqliteEntity
        .update({ id: ralphLoopId }, { activeSessionId: null })
        .pipe(Effect.orDie);
    }
  }).pipe(
    Effect.withSpan("ralphLoop.execution", { attributes: { ralphLoopId } }),
  );

// ---------------------------------------------------------------------------
// Resume executing loops on process restart
// ---------------------------------------------------------------------------

/**
 * Queries for all ralph loops stuck in "executing" status (from a previous
 * process lifetime) and re-starts them. Any tasks that were "running" when
 * the process died are reset to "pending" so they get retried.
 *
 * Call this once at server startup.
 */
export const resumeExecutingLoops = Effect.gen(function* () {
  const executingLoops = yield* ralphLoopSqliteEntity
    .query("byStatus", { pk: { status: "executing" }, sk: { ">": null } })
    .pipe(Effect.orDie);

  const loops = executingLoops.items
    .filter((i) => !i.meta._d)
    .map((i) => i.value);

  if (loops.length === 0) return;

  yield* Effect.log(
    `Resuming ${loops.length} executing ralph loop(s) after restart`,
  ).pipe(Effect.annotateLogs({ loopIds: loops.map((l) => l.id).join(", ") }));

  for (const loop of loops) {
    // Reset any "running" tasks back to "pending" — they were mid-flight
    // when the process died and need to be retried.
    const tasks = yield* getTasks(loop.id);
    const runningTasks = tasks.filter((t) => t.status === "running");

    yield* Effect.all(
      runningTasks.map((t) => setTaskStatus(t.id, "pending")),
      { concurrency: "unbounded" },
    );

    if (runningTasks.length > 0) {
      yield* Effect.log(
        `Reset ${runningTasks.length} running task(s) to pending`,
      ).pipe(Effect.annotateLogs({ ralphLoopId: loop.id }));
    }

    yield* Effect.fork(
      startRalphLoopExecution(loop.id).pipe(
        Effect.catchAll((e) =>
          Effect.gen(function* () {
            yield* Effect.logError(
              "Resumed ralph loop execution failed",
            ).pipe(
              Effect.annotateLogs({
                ralphLoopId: loop.id,
                error: String(e),
              }),
            );
            yield* setLoopStatus(loop.id, "failed");
          }),
        ),
      ),
    );
  }
});

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

export const cancelRalphLoop = (ralphLoopId: string) =>
  Effect.gen(function* () {
    yield* setLoopStatus(ralphLoopId, "cancelled");
  });
