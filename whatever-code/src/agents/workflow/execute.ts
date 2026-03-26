import { Effect } from "effect";
import { v7 } from "uuid";
import { ClaudeOrchestrator } from "../claude/claude.js";
import { CodexOrchestrator } from "../codex/codex.js";
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
    const sessionId = workflow.spec.executeSession;
    const session = yield* getSession(sessionId);

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
