import { Effect } from "effect";
import { v7 } from "uuid";
import { ClaudeOrchestrator } from "../claude/claude.js";
import { CodexOrchestrator } from "../codex/codex.js";
import { workflowSqliteEntity } from "../../db/workflow.js";
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

const createAgentSession = (params: typeof StartExecuteParams.Type) => {
  if (params.agent === "claude") {
    return Effect.gen(function* () {
      const claude = yield* ClaudeOrchestrator;
      const sessionId = yield* claude.createSession(params.session);
      return { type: "claude" as const, sessionId };
    }).pipe(
      Effect.mapError(
        (e) => new ExecuteWorkflowError({ message: errorMessage(e) }),
      ),
    );
  }
  return Effect.gen(function* () {
    const codex = yield* CodexOrchestrator;
    const threadId = yield* codex.createThread(params.thread);
    return { type: "codex" as const, threadId };
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
    const executeSession = yield* createAgentSession(params);

    yield* workflowSqliteEntity
      .insert({
        workflowId,
        projectId: params.projectId,
        spec: { type: "execute", executeSession },
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
    const ref = workflow.spec.executeSession;

    if (ref.type === "claude") {
      const claude = yield* ClaudeOrchestrator;
      yield* claude.continueSession({
        sessionId: ref.sessionId,
        prompt: params.prompt,
      });
    } else {
      const codex = yield* CodexOrchestrator;
      yield* codex.continueThread({
        threadId: ref.threadId,
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
    const ref = workflow.spec.executeSession;

    if (ref.type === "claude") {
      const claude = yield* ClaudeOrchestrator;
      yield* claude.stopSession(ref.sessionId);
    } else {
      const codex = yield* CodexOrchestrator;
      yield* codex.stopThread(ref.threadId);
    }
  }).pipe(
    Effect.mapError((e) =>
      e instanceof ExecuteWorkflowError
        ? e
        : new ExecuteWorkflowError({ message: errorMessage(e) }),
    ),
  );
