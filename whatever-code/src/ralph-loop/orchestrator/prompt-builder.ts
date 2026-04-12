import type { ralphLoopEntity } from "../entity/ralph-loop.js";
import type { ralphLoopTaskEntity } from "../entity/ralph-loop-task.js";

type RalphLoop = typeof ralphLoopEntity.Type;
type RalphLoopTask = typeof ralphLoopTaskEntity.Type;

const buildTaskListSection = (tasks: RalphLoopTask[]): string => {
  const sorted = [...tasks].sort((a, b) => a.order - b.order);

  return sorted
    .map((task) => {
      if (task.status === "completed") {
        return `- [x] Task (id="${task.id}"): "${task.title}" — ${task.outcome ?? "completed"}`;
      }
      if (task.status === "running") {
        return `- [~] Task (id="${task.id}"): "${task.title}" — IN PROGRESS`;
      }
      if (task.status === "failed") {
        return `- [!] Task (id="${task.id}"): "${task.title}" — FAILED${task.outcome ? `: ${task.outcome}` : ""}`;
      }
      return `- [ ] Task (id="${task.id}"): "${task.title}" — ${task.description}`;
    })
    .join("\n");
};

const buildLearningsSection = (tasks: RalphLoopTask[]): string => {
  const sorted = [...tasks].sort((a, b) => a.order - b.order);
  const completedWithLearnings = sorted.filter(
    (t) => t.status === "completed" && t.learnings,
  );

  if (completedWithLearnings.length === 0) return "";

  return `\n## Learnings from completed tasks\n${completedWithLearnings
    .map((t) => `### ${t.title}\n${t.learnings}`)
    .join("\n\n")}\n`;
};

/**
 * Constructs the prompt for a combined pick-and-execute session.
 * The AI reviews the task list, picks a pending task, claims it via
 * claimTask, executes it, then calls taskDone.
 */
export const buildExecuteNextTaskPrompt = (
  loop: RalphLoop,
  tasks: RalphLoopTask[],
): string => {
  const pendingTasks = [...tasks]
    .filter((t) => t.status === "pending")
    .sort((a, b) => a.order - b.order);

  return `${loop.prompt ?? ""}

## Task List
${buildTaskListSection(tasks)}
${buildLearningsSection(tasks)}
## Instructions
You are an autonomous task executor. Your job:

1. **Pick the best next task**: Review the pending tasks (marked with [ ]) above. Consider dependencies — if a later task depends on an earlier one, prioritize the dependency. Pick the highest-priority pending task.

2. **Claim it**: Call \`claimTask\` with the task's id before you start working. This updates the UI to show the task is in progress.

3. **Implement it**: Do the work required by the task description. Be thorough.

4. **Report completion**: Call \`taskDone\` with the taskId, a brief outcome summary, and any learnings that would help future tasks.

${
  pendingTasks.length === 1
    ? `There is only one pending task: "${pendingTasks[0]!.title}" (id="${pendingTasks[0]!.id}"). Claim and execute it.`
    : `There are ${pendingTasks.length} pending tasks. Pick the most appropriate one to work on next.`
}

IMPORTANT: You MUST call \`taskDone\` when the task is complete — this is what signals the orchestrator to move on. Call \`claimTask\` first when possible so the UI tracks progress. Do NOT work on more than one task.`.trim();
};
