import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { Effect } from "effect";
import { v7 } from "uuid";
import { z } from "zod";
import { ralphLoopSqliteEntity } from "../db/entities/ralph-loop.js";
import { ralphLoopTaskSqliteEntity } from "../db/entities/ralph-loop-task.js";
import type { SessionRuntimeOptions } from "../../agents/claude/internal/types.js";

export const persistPlanData = (
  ralphLoopId: string,
  args: {
    prompt: string;
    branchName: string;
    tasks: readonly { title: string; description: string }[];
  },
) =>
  Effect.gen(function* () {
    yield* ralphLoopSqliteEntity
      .update(
        { id: ralphLoopId },
        {
          prompt: args.prompt,
          branchName: args.branchName,
          status: "reviewing",
        },
      )
      .pipe(Effect.orDie);

    const existing = yield* ralphLoopTaskSqliteEntity
      .query("byRalphLoop", {
        pk: { ralphLoopId },
        sk: { ">": null },
      })
      .pipe(Effect.orDie);

    yield* Effect.all(
      existing.items
        .filter((i) => !i.meta._d)
        .map((task) =>
          ralphLoopTaskSqliteEntity
            .delete({ id: task.value.id })
            .pipe(Effect.orDie),
        ),
      { concurrency: "unbounded" },
    );

    yield* Effect.all(
      args.tasks.map((task, i) =>
        ralphLoopTaskSqliteEntity
          .insert({
            id: v7(),
            ralphLoopId,
            title: task.title,
            description: task.description,
            status: "pending",
            order: i,
          })
          .pipe(Effect.orDie),
      ),
      { concurrency: "unbounded" },
    );
  });

export const makeProposedPlanMcpServer = (
  ralphLoopId: string,
  runEffect: <A>(effect: Effect.Effect<A, any, any>) => Promise<A>,
) =>
  createSdkMcpServer({
    name: "ralph-loop-planning",
    version: "1.0.0",
    tools: [
      tool(
        "proposedPlan",
        [
          "Call this tool when you and the user have agreed on a plan for autonomous execution.",
          "This presents the plan to the user for review before they start execution.",
          "You can call this tool multiple times — each call replaces the previous proposal.",
        ].join(" "),
        {
          prompt: z
            .string()
            .describe(
              "Master prompt: overarching instructions for agent behavior during autonomous task execution",
            ),
          branchName: z
            .string()
            .describe(
              "A meaningful git branch name for the work (e.g. feature/auth-system)",
            ),
          tasks: z
            .array(
              z.object({
                title: z
                  .string()
                  .describe("Short task name (e.g. 'Set up auth module')"),
                description: z
                  .string()
                  .describe(
                    "Detailed description with acceptance criteria and expectations",
                  ),
              }),
            )
            .describe("Ordered list of tasks to execute autonomously"),
        },
        async (args) => {
          await runEffect(
            ralphLoopSqliteEntity
              .update(
                { id: ralphLoopId },
                {
                  status: "reviewing",
                  prompt: args.prompt,
                  branchName: args.branchName,
                },
              )
              .pipe(Effect.orDie),
          );

          const taskSummary = args.tasks
            .map((t, i) => `${i + 1}. ${t.title}`)
            .join("\n");

          return {
            content: [
              {
                type: "text",
                text: [
                  "Plan proposed successfully!",
                  "",
                  `Branch: ${args.branchName}`,
                  `Tasks (${args.tasks.length}):`,
                  taskSummary,
                  "",
                  "The user can now review the plan in the UI and start execution.",
                  "If they want changes, continue the conversation and call proposedPlan again with the updated plan.",
                ].join("\n"),
              },
            ],
          };
        },
      ),
    ],
  });

export const buildPlanningRuntimeOptions = (
  ralphLoopId: string,
  runEffect: <A>(effect: Effect.Effect<A, any, any>) => Promise<A>,
): SessionRuntimeOptions => ({
  systemPrompt: {
    type: "preset",
    preset: "claude_code",
    append: [
      "",
      "IMPORTANT: You are in a Ralph Loop planning session.",
      "Your goal is to help the user plan a set of tasks for autonomous execution.",
      "",
      "You have access to a `proposedPlan` MCP tool. When you and the user have",
      "agreed on a plan, you MUST call `proposedPlan` with:",
      "- prompt: overarching instructions for the agent during execution",
      "- branchName: a meaningful git branch name",
      "- tasks: an ordered list of tasks with titles and detailed descriptions",
      "",
      "Do NOT just describe the plan in text. Always call `proposedPlan` to submit it.",
      "Do NOT call ExitPlanMode or any other plan exit mechanism.",
      "The user can continue chatting after you call proposedPlan to refine the plan —",
      "each proposedPlan call replaces the previous one.",
    ].join("\n"),
  },
  mcpServers: {
    "ralph-loop-planning": makeProposedPlanMcpServer(ralphLoopId, runEffect),
  },
});
