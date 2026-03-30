import { Effect } from "effect";
import { v7 } from "uuid";
import { ClaudeOrchestrator } from "../claude/claude.js";
import { CodexOrchestrator } from "../codex/codex.js";
import { WorktreeService } from "../../services/worktree.js";
import { workflowSqliteEntity } from "../../db/workflow.js";
import { sessionSqliteEntity } from "../../db/session.js";
import { errorMessage } from "../../lib/error.js";
import {
  StartExecuteParams,
  ContinueExecuteParams,
  StopExecuteParams,
  ExecuteWorkflowError,
} from "./schema.js";

const getWorkflow = (workflowId: string) =>
  workflowSqliteEntity.get({ workflowId }).pipe(
    Effect.orDie,
    Effect.flatMap((row) =>
      row
        ? Effect.succeed(row.value)
        : Effect.fail(
            new ExecuteWorkflowError({
              message: `workflow ${workflowId} not found`,
            }),
          ),
    ),
    Effect.filterOrFail(
      (
        workflow,
      ): workflow is typeof workflow & {
        spec: Extract<typeof workflow.spec, { type: "execute" }>;
      } => workflow.spec.type === "execute",
      () =>
        new ExecuteWorkflowError({
          message: `workflow ${workflowId} is not an execute workflow`,
        }),
    ),
  );

const getSession = (sessionId: string) =>
  sessionSqliteEntity.get({ sessionId }).pipe(
    Effect.orDie,
    Effect.flatMap((row) =>
      row
        ? Effect.succeed(row.value)
        : Effect.fail(
            new ExecuteWorkflowError({
              message: `session ${sessionId} not found`,
            }),
          ),
    ),
  );

const createAgentSession = (params: typeof StartExecuteParams.Type) => {
  if (params.agent === "claude") {
    return Effect.gen(function* () {
      const claude = yield* ClaudeOrchestrator;
      return yield* claude.createSession(params.session);
    }).pipe(
      Effect.mapError(
        (e) => new ExecuteWorkflowError({ message: errorMessage(e) }),
      ),
    );
  }
  return Effect.gen(function* () {
    const codex = yield* CodexOrchestrator;
    return yield* codex.createThread(params.thread);
  }).pipe(
    Effect.mapError(
      (e) => new ExecuteWorkflowError({ message: errorMessage(e) }),
    ),
  );
};

export const startExecuteWorkflow = (
  params: typeof StartExecuteParams.Type,
) =>
  Effect.gen(function* () {
    const workflowId = v7();
    let worktreeMeta:
      | { path: string; branch: string; repoPath: string }
      | undefined;

    if (params.worktree) {
      const worktreeService = yield* WorktreeService;
      const repoPath =
        params.agent === "claude"
          ? params.session.absolutePath
          : params.thread.absolutePath;
      const branch =
        params.worktree.branchName ?? `execute/${workflowId.slice(0, 8)}`;

      const createParams: {
        repoPath: string;
        branch: string;
        baseBranch?: string;
      } = { repoPath, branch };
      if (params.worktree.baseBranch) {
        createParams.baseBranch = params.worktree.baseBranch;
      }
      const result = yield* worktreeService.create(createParams);

      worktreeMeta = {
        path: result.worktreePath,
        branch: result.branch,
        repoPath,
      };

      // Override absolutePath so the session operates in the worktree
      if (params.agent === "claude") {
        params = {
          ...params,
          session: { ...params.session, absolutePath: result.worktreePath },
        };
      } else {
        params = {
          ...params,
          thread: { ...params.thread, absolutePath: result.worktreePath },
        };
      }
    }

    const executeSession = yield* createAgentSession(params);

    yield* workflowSqliteEntity
      .insert({
        workflowId,
        projectId: params.projectId,
        spec: {
          type: "execute",
          executeSession,
          ...(worktreeMeta ? { worktree: worktreeMeta } : {}),
        },
      })
      .pipe(Effect.orDie);

    return workflowId;
  }).pipe(
    Effect.mapError(
      (e) => new ExecuteWorkflowError({ message: errorMessage(e) }),
    ),
  );

export const continueExecuteWorkflow = (
  params: typeof ContinueExecuteParams.Type,
) =>
  Effect.gen(function* () {
    const workflow = yield* getWorkflow(params.workflowId);
    const sessionId = workflow.spec.executeSession;
    const session = yield* getSession(sessionId);

    // Touch the workflow entity so its _u timestamp reflects recent activity
    yield* workflowSqliteEntity
      .update({ workflowId: params.workflowId }, {})
      .pipe(Effect.orDie);

    if (session.type === "claude") {
      const claude = yield* ClaudeOrchestrator;
      yield* claude.continueSession({
        sessionId,
        prompt: params.prompt,
      });
    } else {
      const codex = yield* CodexOrchestrator;
      yield* codex.continueThread({
        sessionId,
        prompt: params.prompt,
      });
    }
  }).pipe(
    Effect.mapError((e) =>
      e instanceof ExecuteWorkflowError
        ? e
        : new ExecuteWorkflowError({ message: errorMessage(e) }),
    ),
  );

export const stopExecuteWorkflow = (
  params: typeof StopExecuteParams.Type,
) =>
  Effect.gen(function* () {
    const workflow = yield* getWorkflow(params.workflowId);
    const sessionId = workflow.spec.executeSession;
    const session = yield* getSession(sessionId);

    if (session.type === "claude") {
      const claude = yield* ClaudeOrchestrator;
      yield* claude.stopSession(sessionId);
    } else {
      const codex = yield* CodexOrchestrator;
      yield* codex.stopThread(sessionId);
    }
  }).pipe(
    Effect.mapError((e) =>
      e instanceof ExecuteWorkflowError
        ? e
        : new ExecuteWorkflowError({ message: errorMessage(e) }),
    ),
  );

export const removeExecuteWorkflow = (params: { workflowId: string }) =>
  Effect.gen(function* () {
    const workflow = yield* getWorkflow(params.workflowId);

    if (workflow.spec.worktree) {
      const worktreeService = yield* WorktreeService;
      yield* worktreeService.remove({
        worktreePath: workflow.spec.worktree.path,
      });
    }

    yield* workflowSqliteEntity
      .delete({ workflowId: params.workflowId })
      .pipe(Effect.orDie);
  }).pipe(
    Effect.mapError((e) =>
      e instanceof ExecuteWorkflowError
        ? e
        : new ExecuteWorkflowError({ message: errorMessage(e) }),
    ),
  );
