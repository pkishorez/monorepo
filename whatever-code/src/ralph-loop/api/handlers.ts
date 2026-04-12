import { Effect, Runtime } from "effect";
import { v7 } from "uuid";
import { RalphLoopRpcs } from "./definitions.js";
import { RalphLoopError } from "./schema.js";
import { ClaudeOrchestrator } from "../../agents/claude/claude.js";
import { projectSqliteEntity } from "../../db/entities/claude.js";
import { ralphLoopSqliteEntity } from "../db/entities/ralph-loop.js";
import { ralphLoopTaskSqliteEntity } from "../db/entities/ralph-loop-task.js";
import { workflowSqliteEntity } from "../../db/entities/workflow.js";
import {
  createWorktreeForLoop,
  startRalphLoopExecution,
  cancelRalphLoop,
  makeRunEffect,
  getLoop,
} from "../orchestrator/runner.js";
import {
  buildPlanningRuntimeOptions,
  persistPlanData,
} from "../orchestrator/planning-tools.js";
import { errorMessage } from "../../lib/error.js";

const toRalphLoopError = Effect.mapError((e: unknown) =>
  e instanceof RalphLoopError
    ? e
    : new RalphLoopError({ message: errorMessage(e) }),
);

export const RalphLoopHandlers = RalphLoopRpcs.toLayer(
  RalphLoopRpcs.of({
    "ralphLoop.create": (params) =>
      Effect.gen(function* () {
        const ralphLoopId = v7();
        const runtime = yield* Effect.runtime<never>();
        const runEffect = makeRunEffect(runtime);

        const project = yield* projectSqliteEntity
          .get({ id: params.projectId })
          .pipe(Effect.orDie);
        if (!project) {
          return yield* Effect.fail(
            new RalphLoopError({
              message: `Project ${params.projectId} not found`,
            }),
          );
        }

        // Insert before session creation so finalizePlan tool can find the loop on the first turn
        yield* ralphLoopSqliteEntity
          .insert({
            id: ralphLoopId,
            projectId: params.projectId,
            planningSessionId: "", // placeholder, updated below
            status: "planning",
          })
          .pipe(Effect.orDie);

        const runtimeOptions = buildPlanningRuntimeOptions(
          ralphLoopId,
          runEffect,
        );

        yield* Effect.logInfo("Creating ralph loop planning session").pipe(
          Effect.annotateLogs({
            ralphLoopId,
            projectId: params.projectId,
            model: params.model,
          }),
        );

        const claude = yield* ClaudeOrchestrator;
        const planningSessionId = yield* claude
          .createSession(
            {
              absolutePath: project.value.id,
              prompt: params.prompt,
              model: params.model,
              interactionMode: "default",
              persistSession: true,
              effort: "high",
              maxTurns: 0,
              maxBudgetUsd: 0,
            },
            runtimeOptions,
          )
          .pipe(
            Effect.tapError((e) =>
              Effect.logError(
                "Ralph loop planning session creation failed",
              ).pipe(
                Effect.annotateLogs({
                  ralphLoopId,
                  error: errorMessage(e),
                }),
              ),
            ),
            Effect.mapError(
              (e) =>
                new RalphLoopError({
                  message: `Failed to create planning session: ${errorMessage(e)}`,
                }),
            ),
          );

        yield* ralphLoopSqliteEntity
          .update({ id: ralphLoopId }, { planningSessionId })
          .pipe(Effect.orDie);

        const workflowId = v7();
        yield* workflowSqliteEntity
          .insert({
            workflowId,
            projectId: params.projectId,
            spec: {
              type: "ralph-loop",
              ralphLoopId,
            },
          })
          .pipe(Effect.orDie);

        return { ralphLoopId, planningSessionId, workflowId };
      }).pipe(toRalphLoopError),

    "ralphLoop.continuePlanning": (params) =>
      Effect.gen(function* () {
        const loop = yield* getLoop(params.ralphLoopId);

        if (loop.status !== "planning" && loop.status !== "reviewing") {
          return yield* Effect.fail(
            new RalphLoopError({
              message: `Cannot continue planning: loop is in "${loop.status}" status`,
            }),
          );
        }

        const runtime = yield* Effect.runtime<never>();
        const runEffect = makeRunEffect(runtime);
        const runtimeOptions = buildPlanningRuntimeOptions(
          params.ralphLoopId,
          runEffect,
        );

        const claude = yield* ClaudeOrchestrator;
        yield* claude.continueSession(
          {
            sessionId: loop.planningSessionId,
            prompt: params.prompt,
          },
          runtimeOptions,
        );
      }).pipe(toRalphLoopError),

    "ralphLoop.finalizeTasks": (params) =>
      Effect.gen(function* () {
        const loop = yield* getLoop(params.ralphLoopId);

        if (loop.status !== "planning" && loop.status !== "reviewing") {
          return yield* Effect.fail(
            new RalphLoopError({
              message: `Cannot finalize tasks: loop is in "${loop.status}" status`,
            }),
          );
        }

        yield* persistPlanData(params.ralphLoopId, {
          prompt: params.prompt,
          branchName: params.branchName,
          tasks: params.tasks,
        });
      }).pipe(toRalphLoopError),

    "ralphLoop.startExecution": (params) =>
      Effect.gen(function* () {
        const loop = yield* getLoop(params.ralphLoopId);

        if (loop.status !== "reviewing") {
          return yield* Effect.fail(
            new RalphLoopError({
              message: `Cannot start execution: loop is in "${loop.status}" status`,
            }),
          );
        }

        yield* ralphLoopSqliteEntity
          .update({ id: params.ralphLoopId }, { model: params.model })
          .pipe(Effect.orDie);

        const project = yield* projectSqliteEntity
          .get({ id: loop.projectId })
          .pipe(Effect.orDie);
        if (!project) {
          return yield* Effect.fail(
            new RalphLoopError({
              message: `Project ${loop.projectId} not found`,
            }),
          );
        }

        yield* createWorktreeForLoop(
          { ...loop, model: params.model },
          project.value.id,
        ).pipe(
          Effect.mapError(
            (e) =>
              new RalphLoopError({
                message: `Failed to create worktree: ${errorMessage(e)}`,
              }),
          ),
        );

        const runtime = yield* Effect.runtime<never>();
        Runtime.runFork(runtime)(
          startRalphLoopExecution(params.ralphLoopId).pipe(
            Effect.catchAll((e) =>
              Effect.gen(function* () {
                yield* Effect.logError("Ralph loop execution failed").pipe(
                  Effect.annotateLogs({
                    ralphLoopId: params.ralphLoopId,
                    error: errorMessage(e),
                  }),
                );
                yield* ralphLoopSqliteEntity
                  .update(
                    { id: params.ralphLoopId },
                    { status: "failed" },
                  )
                  .pipe(Effect.orDie);
              }),
            ),
          ) as Effect.Effect<void>,
        );
      }).pipe(toRalphLoopError),

    "ralphLoop.cancel": (params) =>
      cancelRalphLoop(params.ralphLoopId).pipe(toRalphLoopError),

    "ralphLoop.query": ({ ">": cursor }) =>
      ralphLoopSqliteEntity
        .query("byUpdatedAt", { pk: {}, sk: { ">": cursor } })
        .pipe(Effect.map(({ items }) => items), toRalphLoopError),

    "ralphLoop.queryTasks": ({ ralphLoopId }) =>
      ralphLoopTaskSqliteEntity
        .query("byRalphLoop", {
          pk: { ralphLoopId },
          sk: { ">": null },
        })
        .pipe(
          Effect.map(({ items }) => items.filter((i) => !i.meta._d)),
          toRalphLoopError,
        ),
  }),
);
