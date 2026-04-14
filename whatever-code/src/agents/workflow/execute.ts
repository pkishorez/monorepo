import { Effect } from "effect";
import { v7 } from "uuid";
import { ClaudeOrchestrator } from "../claude/claude.js";
import { CodexOrchestrator } from "../codex/codex.js";
import { WorktreeService } from "../../services/worktree.js";
import { workflowSqliteEntity } from "../../db/entities/workflow.js";
import { sessionSqliteEntity } from "../../db/entities/session.js";
import { errorMessage } from "../../core/lib/error.js";
import { deriveSessionName } from "../shared/session-name.js";
import {
  StartExecuteParams,
  ContinueExecuteParams,
  StopExecuteParams,
  ExecuteWorkflowError,
  type OnExecuteStatusUpdate,
} from "./schema.js";

const getExecuteWorkflow = (workflowId: string) =>
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

const createAgentSession = (
  params: typeof StartExecuteParams.Type,
  onStatusUpdate?: OnExecuteStatusUpdate,
) => {
  if (params.agent === "claude") {
    return Effect.gen(function* () {
      const claude = yield* ClaudeOrchestrator;
      return yield* claude.createSession(params.session, undefined, onStatusUpdate);
    }).pipe(
      Effect.mapError(
        (e) => new ExecuteWorkflowError({ message: errorMessage(e) }),
      ),
      Effect.withSpan("workflow.createAgentSession", { attributes: { agent: params.agent } }),
    );
  }
  return Effect.gen(function* () {
    const codex = yield* CodexOrchestrator;
    return yield* codex.createThread(params.thread, onStatusUpdate);
  }).pipe(
    Effect.mapError(
      (e) => new ExecuteWorkflowError({ message: errorMessage(e) }),
    ),
    Effect.withSpan("workflow.createAgentSession", { attributes: { agent: params.agent } }),
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
      const result = yield* worktreeService.create(createParams).pipe(
        Effect.withSpan("workflow.createWorktree", { attributes: { repoPath, branch } }),
      );

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

    // Build the status callback — uses a mutable ref for the session ID
    // since it's not known until createAgentSession returns. The callback
    // is only invoked asynchronously from the forked fiber, so the ref
    // will be set by the time any status update fires.
    const sessionIdRef = { current: "" };
    const onStatusUpdate: OnExecuteStatusUpdate = (update) =>
      workflowSqliteEntity
        .update(
          { workflowId },
          {
            spec: {
              type: "execute",
              executeSession: sessionIdRef.current,
              ...(worktreeMeta ? { worktree: worktreeMeta } : {}),
              status: update.status,
            },
            ...(update.name ? { name: update.name } : {}),
          },
        )
        .pipe(Effect.orDie, Effect.asVoid) as Effect.Effect<void>;

    const executeSession = yield* createAgentSession(params, onStatusUpdate);
    sessionIdRef.current = executeSession;

    const prompt =
      params.agent === "claude" ? params.session.prompt : params.thread.prompt;

    yield* workflowSqliteEntity
      .insert({
        workflowId,
        projectId: params.projectId,
        name: deriveSessionName(prompt),
        spec: {
          type: "execute",
          executeSession,
          ...(worktreeMeta ? { worktree: worktreeMeta } : {}),
          status: "executing",
        },
      })
      .pipe(Effect.orDie);

    yield* Effect.log("workflow: record persisted").pipe(
      Effect.annotateLogs({ workflowId, agent: params.agent }),
    );

    return workflowId;
  }).pipe(
    Effect.mapError(
      (e) => new ExecuteWorkflowError({ message: errorMessage(e) }),
    ),
    Effect.withSpan("workflow.execute.start", {
      attributes: { agent: params.agent, hasWorktree: !!params.worktree },
    }),
  );

export const continueExecuteWorkflow = (
  params: typeof ContinueExecuteParams.Type,
) =>
  Effect.gen(function* () {
    const workflow = yield* getExecuteWorkflow(params.workflowId);
    const sessionId = workflow.spec.executeSession;
    const session = yield* getSession(sessionId);

    // Rebuild the status callback from the existing spec config
    const onStatusUpdate: OnExecuteStatusUpdate = (update) =>
      workflowSqliteEntity
        .update(
          { workflowId: params.workflowId },
          {
            spec: { ...workflow.spec, status: update.status },
            ...(update.name ? { name: update.name } : {}),
          },
        )
        .pipe(Effect.orDie, Effect.asVoid) as Effect.Effect<void>;

    yield* onStatusUpdate({ status: "executing" });

    if (session.type === "claude") {
      const claude = yield* ClaudeOrchestrator;
      yield* claude.continueSession({
        sessionId,
        prompt: params.prompt,
      }, undefined, onStatusUpdate);
    } else {
      const codex = yield* CodexOrchestrator;
      yield* codex.continueThread({
        sessionId,
        prompt: params.prompt,
      }, undefined, onStatusUpdate);
    }

    yield* Effect.log("workflow: continue dispatched").pipe(
      Effect.annotateLogs({ workflowId: params.workflowId, sessionId, agent: session.type }),
    );
  }).pipe(
    Effect.mapError((e) =>
      e instanceof ExecuteWorkflowError
        ? e
        : new ExecuteWorkflowError({ message: errorMessage(e) }),
    ),
    Effect.withSpan("workflow.execute.continue", { attributes: { workflowId: params.workflowId } }),
  );

export const stopExecuteWorkflow = (
  params: typeof StopExecuteParams.Type,
) =>
  Effect.gen(function* () {
    const workflow = yield* getExecuteWorkflow(params.workflowId);
    const sessionId = workflow.spec.executeSession;
    const session = yield* getSession(sessionId);

    if (session.type === "claude") {
      const claude = yield* ClaudeOrchestrator;
      yield* claude.stopSession(sessionId);
    } else {
      const codex = yield* CodexOrchestrator;
      yield* codex.stopThread(sessionId);
    }

    // Mark workflow as interrupted
    yield* workflowSqliteEntity
      .update(
        { workflowId: params.workflowId },
        { spec: { ...workflow.spec, status: "interrupted" } },
      )
      .pipe(Effect.orDie);
  }).pipe(
    Effect.mapError((e) =>
      e instanceof ExecuteWorkflowError
        ? e
        : new ExecuteWorkflowError({ message: errorMessage(e) }),
    ),
    Effect.withSpan("workflow.execute.stop", { attributes: { workflowId: params.workflowId } }),
  );

export const removeExecuteWorkflow = (params: { workflowId: string }) =>
  Effect.gen(function* () {
    const workflow = yield* getExecuteWorkflow(params.workflowId);

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
    Effect.withSpan("workflow.execute.remove", { attributes: { workflowId: params.workflowId } }),
  );

export const archiveWorkflow = (params: {
  workflowId: string;
  archived: boolean;
}) =>
  Effect.gen(function* () {
    // Verify the workflow exists (without filtering by spec type — archiving
    // is a generic operation that applies to any workflow kind).
    const row = yield* workflowSqliteEntity
      .get({ workflowId: params.workflowId })
      .pipe(Effect.orDie);
    if (!row) {
      yield* Effect.fail(
        new ExecuteWorkflowError({
          message: `workflow ${params.workflowId} not found`,
        }),
      );
    }
    yield* workflowSqliteEntity
      .update({ workflowId: params.workflowId }, { archived: params.archived })
      .pipe(Effect.orDie);
  }).pipe(
    Effect.mapError((e) =>
      e instanceof ExecuteWorkflowError
        ? e
        : new ExecuteWorkflowError({ message: errorMessage(e) }),
    ),
    Effect.withSpan("workflow.archive", { attributes: { workflowId: params.workflowId } }),
  );
