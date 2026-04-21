import { Effect, Runtime } from 'effect';
import { v7 } from 'uuid';
import { RalphLoopRpcs } from './definitions.js';
import { RalphLoopError } from './schema.js';
import type { OnRalphLoopStatusUpdate } from '../../agents/workflow/schema.js';
import { deriveSessionName } from '../../agents/shared/session-name.js';
import { ClaudeOrchestrator } from '../../agents/claude/claude.js';
import { projectSqliteEntity } from '../../db/entities/claude.js';
import { ralphLoopSqliteEntity } from '../db/entities/ralph-loop.js';
import { ralphLoopTaskSqliteEntity } from '../db/entities/ralph-loop-task.js';
import { workflowSqliteEntity } from '../../db/entities/workflow.js';
import {
  createWorktreeForLoop,
  startRalphLoopExecution,
  cancelRalphLoop,
  makeRunEffect,
  getLoop,
} from '../orchestrator/runner.js';
import {
  buildPlanningRuntimeOptions,
  persistPlanData,
} from '../orchestrator/planning-tools.js';
import { errorMessage } from '../../core/lib/error.js';

/** Build a ralph-loop status update callback bound to a workflow. */
const makeRalphLoopStatusCallback =
  (workflowId: string, ralphLoopId: string): OnRalphLoopStatusUpdate =>
  (update) =>
    workflowSqliteEntity
      .update(
        { workflowId },
        {
          spec: {
            type: 'ralph-loop' as const,
            ralphLoopId,
            status: update.status,
            completedTasks: update.completedTasks,
            totalTasks: update.totalTasks,
          },
          ...(update.name ? { name: update.name } : {}),
        },
      )
      .pipe(Effect.orDie, Effect.asVoid) as Effect.Effect<void>;

const toRalphLoopError = Effect.mapError((e: unknown) =>
  e instanceof RalphLoopError
    ? e
    : new RalphLoopError({ message: errorMessage(e) }),
);

export const RalphLoopHandlers = RalphLoopRpcs.toLayer(
  RalphLoopRpcs.of({
    'ralphLoop.create': (params) =>
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

        yield* ralphLoopSqliteEntity
          .insert({
            id: ralphLoopId,
            projectId: params.projectId,
            planningSessionId: '',
            status: 'planning',
          })
          .pipe(Effect.orDie);

        const runtimeOptions = buildPlanningRuntimeOptions(
          ralphLoopId,
          runEffect,
        );

        yield* Effect.logInfo('Creating ralph loop planning session').pipe(
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
              interactionMode: 'plan',
              persistSession: true,
              effort: 'high',
              maxTurns: 0,
              maxBudgetUsd: 0,
            },
            runtimeOptions,
          )
          .pipe(
            Effect.tapError((e) =>
              Effect.logError(
                'Ralph loop planning session creation failed',
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
            name: deriveSessionName(params.prompt),
            spec: {
              type: 'ralph-loop',
              ralphLoopId,
              status: 'planning',
              completedTasks: 0,
              totalTasks: 0,
            },
          })
          .pipe(Effect.orDie);

        return { ralphLoopId, planningSessionId, workflowId };
      }).pipe(
        toRalphLoopError,
        Effect.withSpan('rpc.ralphLoop.create', {
          attributes: { projectId: params.projectId, model: params.model },
        }),
      ),

    'ralphLoop.continuePlanning': (params) =>
      Effect.gen(function* () {
        const loop = yield* getLoop(params.ralphLoopId);

        if (loop.status !== 'planning' && loop.status !== 'reviewing') {
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
      }).pipe(
        toRalphLoopError,
        Effect.withSpan('rpc.ralphLoop.continuePlanning', {
          attributes: { ralphLoopId: params.ralphLoopId },
        }),
      ),

    'ralphLoop.startExecution': (params) =>
      Effect.gen(function* () {
        const loop = yield* getLoop(params.ralphLoopId);

        if (loop.status !== 'reviewing') {
          return yield* Effect.fail(
            new RalphLoopError({
              message: `Cannot start execution: loop is in "${loop.status}" status`,
            }),
          );
        }

        yield* persistPlanData(params.ralphLoopId, {
          prompt: params.prompt,
          branchName: params.branchName,
          tasks: params.tasks,
        });

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
          { ...loop, branchName: params.branchName, model: params.model },
          project.value.id,
        ).pipe(
          Effect.mapError(
            (e) =>
              new RalphLoopError({
                message: `Failed to create worktree: ${errorMessage(e)}`,
              }),
          ),
        );

        // Find the workflow linked to this ralph loop so we can push status updates
        const workflows = yield* workflowSqliteEntity
          .query('byUpdatedAt', { pk: {}, sk: { '>': null } })
          .pipe(Effect.orDie);
        const workflow = workflows.items.find(
          (w) =>
            w.value.spec.type === 'ralph-loop' &&
            w.value.spec.ralphLoopId === params.ralphLoopId,
        );
        const onStatusUpdate = workflow
          ? makeRalphLoopStatusCallback(
              workflow.value.workflowId,
              params.ralphLoopId,
            )
          : undefined;

        const runtime = yield* Effect.runtime<never>();
        Runtime.runFork(runtime)(
          startRalphLoopExecution(params.ralphLoopId, onStatusUpdate).pipe(
            Effect.catchAll((e) =>
              Effect.gen(function* () {
                yield* Effect.logError('Ralph loop execution failed').pipe(
                  Effect.annotateLogs({
                    ralphLoopId: params.ralphLoopId,
                    error: errorMessage(e),
                  }),
                );
                yield* ralphLoopSqliteEntity
                  .update({ id: params.ralphLoopId }, { status: 'failed' })
                  .pipe(Effect.orDie);
                if (onStatusUpdate) {
                  const tasks = yield* ralphLoopTaskSqliteEntity
                    .query('byRalphLoop', {
                      pk: { ralphLoopId: params.ralphLoopId },
                      sk: { '>': null },
                    })
                    .pipe(Effect.orDie);
                  const total = tasks.items.filter((i) => !i.meta._d).length;
                  const completed = tasks.items.filter(
                    (i) => !i.meta._d && i.value.status === 'completed',
                  ).length;
                  yield* onStatusUpdate({
                    status: 'failed',
                    completedTasks: completed,
                    totalTasks: total,
                  });
                }
              }),
            ),
          ) as Effect.Effect<void>,
        );
      }).pipe(
        toRalphLoopError,
        Effect.withSpan('rpc.ralphLoop.startExecution', {
          attributes: { ralphLoopId: params.ralphLoopId },
        }),
      ),

    'ralphLoop.interruptPlanning': (params) =>
      Effect.gen(function* () {
        const loop = yield* getLoop(params.ralphLoopId);

        if (loop.status !== 'planning' && loop.status !== 'reviewing') {
          return;
        }

        const claude = yield* ClaudeOrchestrator;
        yield* claude.stopSession(loop.planningSessionId);

        // Push cancelled status to the workflow
        const workflows = yield* workflowSqliteEntity
          .query('byUpdatedAt', { pk: {}, sk: { '>': null } })
          .pipe(Effect.orDie);
        const workflow = workflows.items.find(
          (w) =>
            w.value.spec.type === 'ralph-loop' &&
            w.value.spec.ralphLoopId === params.ralphLoopId,
        );
        if (workflow) {
          yield* makeRalphLoopStatusCallback(
            workflow.value.workflowId,
            params.ralphLoopId,
          )({
            status: 'cancelled',
            completedTasks: 0,
            totalTasks: 0,
          });
        }
      }).pipe(
        toRalphLoopError,
        Effect.withSpan('rpc.ralphLoop.interruptPlanning', {
          attributes: { ralphLoopId: params.ralphLoopId },
        }),
      ),

    'ralphLoop.cancel': (params) =>
      Effect.gen(function* () {
        yield* cancelRalphLoop(params.ralphLoopId);

        // Push cancelled status to the workflow
        const workflows = yield* workflowSqliteEntity
          .query('byUpdatedAt', { pk: {}, sk: { '>': null } })
          .pipe(Effect.orDie);
        const workflow = workflows.items.find(
          (w) =>
            w.value.spec.type === 'ralph-loop' &&
            w.value.spec.ralphLoopId === params.ralphLoopId,
        );
        if (workflow) {
          const tasks = yield* ralphLoopTaskSqliteEntity
            .query('byRalphLoop', {
              pk: { ralphLoopId: params.ralphLoopId },
              sk: { '>': null },
            })
            .pipe(Effect.orDie);
          const total = tasks.items.filter((i) => !i.meta._d).length;
          const completed = tasks.items.filter(
            (i) => !i.meta._d && i.value.status === 'completed',
          ).length;
          yield* makeRalphLoopStatusCallback(
            workflow.value.workflowId,
            params.ralphLoopId,
          )({
            status: 'cancelled',
            completedTasks: completed,
            totalTasks: total,
          });
        }
      }).pipe(
        toRalphLoopError,
        Effect.withSpan('rpc.ralphLoop.cancel', {
          attributes: { ralphLoopId: params.ralphLoopId },
        }),
      ),

    'ralphLoop.query': ({ '>': cursor }) =>
      ralphLoopSqliteEntity
        .query('byUpdatedAt', { pk: {}, sk: { '>': cursor } })
        .pipe(
          Effect.map(({ items }) => items),
          toRalphLoopError,
          Effect.withSpan('rpc.ralphLoop.query'),
        ),

    'ralphLoop.queryTasks': ({ ralphLoopId }) =>
      ralphLoopTaskSqliteEntity
        .query('byRalphLoop', {
          pk: { ralphLoopId },
          sk: { '>': null },
        })
        .pipe(
          Effect.map(({ items }) => items.filter((i) => !i.meta._d)),
          toRalphLoopError,
          Effect.withSpan('rpc.ralphLoop.queryTasks', {
            attributes: { ralphLoopId },
          }),
        ),
  }),
);
