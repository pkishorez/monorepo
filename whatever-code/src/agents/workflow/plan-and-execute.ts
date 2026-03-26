import { Effect, Runtime } from "effect";
import { v7 } from "uuid";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { ClaudeOrchestrator } from "../claude/claude.js";
import type { SessionRuntimeOptions } from "../claude/schema.js";
import { projectSqliteEntity } from "../../db/claude.js";
import { sessionSqliteEntity } from "../../db/session.js";
import { workflowSqliteEntity } from "../../db/workflow.js";
import { errorMessage } from "../../lib/error.js";
import {
  StartPlanParams,
  ContinuePlanParams,
  StartExecutePhaseParams,
  ContinueExecutePhaseParams,
  StopPlanAndExecuteParams,
  PlanAndExecuteWorkflowError,
} from "./schema.js";

const PLANNING_SYSTEM_PROMPT = `
You are in PLANNING MODE. Your role is to help the user design an implementation plan.

## Rules
- Explore the codebase, ask clarifying questions, and think through the approach.
- When you have a finalized plan, call the \`submit_plan\` MCP tool with the full plan in markdown.
- You may call \`submit_plan\` multiple times — each call replaces the previous version.
- Do NOT use EnterPlanMode or ExitPlanMode — plan lifecycle is managed externally.
- Do NOT execute the plan (no code edits, no file writes, no destructive commands). Research and read-only operations are fine.

## Plan format
Your plan should include:
1. **Context** — why this change is needed
2. **Steps** — ordered list of changes with file paths
3. **Verification** — how to test the changes
`.trim();

const buildPlanningRuntimeOptions = (workflowId: string) =>
  Effect.gen(function* () {
    const rt = yield* Effect.runtime<never>();

    const planServer = createSdkMcpServer({
      name: "plan",
      tools: [
        tool(
          "submit_plan",
          "Submit or update the implementation plan. Call this when you have a finalized plan ready for the user to review. You may call it multiple times — each call replaces the previous plan.",
          {
            plan: z
              .string()
              .describe("The full plan content in markdown format"),
          },
          async ({ plan }) => {
            await Runtime.runPromise(rt)(
              Effect.gen(function* () {
                const row = yield* workflowSqliteEntity
                  .get({ workflowId })
                  .pipe(Effect.orDie);
                if (!row) return;
                const wf = row.value;
                if (
                  wf.spec.type !== "plan-and-execute" ||
                  wf.spec.current.stage !== "planning"
                )
                  return;
                yield* workflowSqliteEntity
                  .update(
                    { workflowId },
                    {
                      spec: {
                        type: "plan-and-execute",
                        current: { ...wf.spec.current, planArtifact: plan },
                      },
                    },
                  )
                  .pipe(Effect.orDie);
              }) as Effect.Effect<void, never, never>,
            );
            return {
              content: [{ type: "text" as const, text: "Plan submitted." }],
            };
          },
          { annotations: { readOnly: false, destructive: false } },
        ),
      ],
    });

    const autoApproveSubmitPlan = async () => ({
      hookSpecificOutput: {
        hookEventName: "PreToolUse" as const,
        permissionDecision: "allow" as const,
      },
    });

    const denyAllPermissionRequests = async () => ({
      hookSpecificOutput: {
        hookEventName: "PermissionRequest" as const,
        decision: {
          behavior: "deny" as const,
          message:
            "Planning mode does not allow operations that require permission.",
        },
      },
    });

    const runtimeOptions: SessionRuntimeOptions = {
      mcpServers: { plan: planServer },
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: PLANNING_SYSTEM_PROMPT,
      },
      hooks: {
        PreToolUse: [
          { matcher: "mcp__plan__submit_plan", hooks: [autoApproveSubmitPlan] },
        ],
        PermissionRequest: [{ hooks: [denyAllPermissionRequests] }],
      },
    };

    return runtimeOptions;
  });

export const startPlan = (params: typeof StartPlanParams.Type) =>
  Effect.gen(function* () {
    const workflowId = v7();
    const runtimeOptions = yield* buildPlanningRuntimeOptions(workflowId);
    const claude = yield* ClaudeOrchestrator;
    const sessionId = yield* claude.createSession(
      params.session,
      runtimeOptions,
    );

    yield* workflowSqliteEntity
      .insert({
        workflowId,
        projectId: params.projectId,
        spec: {
          type: "plan-and-execute",
          current: {
            stage: "planning",
            planSession: sessionId,
            planArtifact: null,
          },
        },
      })
      .pipe(Effect.orDie);

    return workflowId;
  }).pipe(
    Effect.mapError(
      (e) => new PlanAndExecuteWorkflowError({ message: errorMessage(e) }),
    ),
  );

export const continuePlan = (params: typeof ContinuePlanParams.Type) =>
  Effect.gen(function* () {
    const workflow = yield* getWorkflow(params.workflowId);

    if (workflow.spec.current.stage !== "planning") {
      return yield* Effect.fail(
        new PlanAndExecuteWorkflowError({
          message: `workflow ${params.workflowId} is not in planning stage`,
        }),
      );
    }

    const sessionId = workflow.spec.current.planSession;
    const session = yield* sessionSqliteEntity
      .get({ sessionId })
      .pipe(
        Effect.orDie,
        Effect.flatMap((row) =>
          row && row.value.type === "claude"
            ? Effect.succeed(row.value)
            : Effect.fail(
                new PlanAndExecuteWorkflowError({
                  message: "plan-and-execute only supports Claude sessions",
                }),
              ),
        ),
      );

    const runtimeOptions = yield* buildPlanningRuntimeOptions(
      params.workflowId,
    );
    const claude = yield* ClaudeOrchestrator;
    yield* claude.continueSession(
      { sessionId, prompt: params.prompt },
      false,
      runtimeOptions,
    );
  }).pipe(
    Effect.mapError((e) =>
      e instanceof PlanAndExecuteWorkflowError
        ? e
        : new PlanAndExecuteWorkflowError({ message: errorMessage(e) }),
    ),
  );

export const startExecutePhase = (
  params: typeof StartExecutePhaseParams.Type,
) =>
  Effect.gen(function* () {
    const workflow = yield* getWorkflow(params.workflowId);

    if (workflow.spec.current.stage !== "planning") {
      return yield* Effect.fail(
        new PlanAndExecuteWorkflowError({
          message: `workflow ${params.workflowId} is not in planning stage`,
        }),
      );
    }

    const planArtifact = workflow.spec.current.planArtifact;
    if (!planArtifact) {
      return yield* Effect.fail(
        new PlanAndExecuteWorkflowError({
          message:
            "plan artifact has not been produced yet — planning session must write a plan first",
        }),
      );
    }

    const project = yield* projectSqliteEntity
      .get({ id: workflow.projectId })
      .pipe(
        Effect.orDie,
        Effect.flatMap((row) =>
          row
            ? Effect.succeed(row.value)
            : Effect.fail(
                new PlanAndExecuteWorkflowError({
                  message: `project ${workflow.projectId} not found`,
                }),
              ),
        ),
      );

    const claude = yield* ClaudeOrchestrator;
    const sessionId = yield* claude.createSession({
      absolutePath: project.id,
      prompt: planArtifact,
      model: params.model,
      permissionMode: params.permissionMode,
      persistSession: true,
      effort: params.effort,
      maxTurns: params.maxTurns,
      maxBudgetUsd: params.maxBudgetUsd,
    });

    yield* workflowSqliteEntity
      .update(
        { workflowId: params.workflowId },
        {
          spec: {
            type: "plan-and-execute",
            current: {
              stage: "executing",
              planSession: workflow.spec.current.planSession,
              planArtifact,
              executeSession: sessionId,
            },
          },
        },
      )
      .pipe(Effect.orDie);
  }).pipe(
    Effect.mapError((e) =>
      e instanceof PlanAndExecuteWorkflowError
        ? e
        : new PlanAndExecuteWorkflowError({ message: errorMessage(e) }),
    ),
  );

export const continueExecutePhase = (
  params: typeof ContinueExecutePhaseParams.Type,
) =>
  Effect.gen(function* () {
    const workflow = yield* getWorkflow(params.workflowId);

    if (workflow.spec.current.stage !== "executing") {
      return yield* Effect.fail(
        new PlanAndExecuteWorkflowError({
          message: `workflow ${params.workflowId} is not in executing stage`,
        }),
      );
    }

    const sessionId = workflow.spec.current.executeSession;
    const session = yield* sessionSqliteEntity
      .get({ sessionId })
      .pipe(
        Effect.orDie,
        Effect.flatMap((row) =>
          row && row.value.type === "claude"
            ? Effect.succeed(row.value)
            : Effect.fail(
                new PlanAndExecuteWorkflowError({
                  message: "plan-and-execute only supports Claude sessions",
                }),
              ),
        ),
      );

    const claude = yield* ClaudeOrchestrator;
    yield* claude.continueSession({
      sessionId,
      prompt: params.prompt,
    });
  }).pipe(
    Effect.mapError((e) =>
      e instanceof PlanAndExecuteWorkflowError
        ? e
        : new PlanAndExecuteWorkflowError({ message: errorMessage(e) }),
    ),
  );

export const stopPlanAndExecute = (
  params: typeof StopPlanAndExecuteParams.Type,
) =>
  Effect.gen(function* () {
    const workflow = yield* getWorkflow(params.workflowId);
    const claude = yield* ClaudeOrchestrator;
    const { current } = workflow.spec;

    if (current.stage === "planning") {
      yield* claude.stopSession(current.planSession);
    } else if (current.stage === "executing") {
      yield* claude.stopSession(current.executeSession);
    }
  }).pipe(
    Effect.mapError((e) =>
      e instanceof PlanAndExecuteWorkflowError
        ? e
        : new PlanAndExecuteWorkflowError({ message: errorMessage(e) }),
    ),
  );

const getWorkflow = (workflowId: string) =>
  workflowSqliteEntity.get({ workflowId }).pipe(
    Effect.orDie,
    Effect.flatMap((row) =>
      row
        ? Effect.succeed(row.value)
        : Effect.fail(
            new PlanAndExecuteWorkflowError({
              message: `workflow ${workflowId} not found`,
            }),
          ),
    ),
    Effect.filterOrFail(
      (
        workflow,
      ): workflow is typeof workflow & {
        spec: Extract<typeof workflow.spec, { type: "plan-and-execute" }>;
      } => workflow.spec.type === "plan-and-execute",
      () =>
        new PlanAndExecuteWorkflowError({
          message: `workflow ${workflowId} is not a plan-and-execute workflow`,
        }),
    ),
  );
