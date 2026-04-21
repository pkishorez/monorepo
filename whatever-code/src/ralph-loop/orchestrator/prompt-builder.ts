import type { ralphLoopEntity } from '../entity/ralph-loop.js';
import type { ralphLoopTaskEntity } from '../entity/ralph-loop-task.js';

type RalphLoop = typeof ralphLoopEntity.Type;
type RalphLoopTask = typeof ralphLoopTaskEntity.Type;

const STATUS_ICONS = {
  completed: '✅',
  running: '🔄',
  failed: '❌',
  pending: '⏳',
} as const;

const buildTaskListSection = (tasks: RalphLoopTask[]): string => {
  const sorted = [...tasks].sort((a, b) => a.order - b.order);

  const completed = sorted.filter((t) => t.status === 'completed');
  const running = sorted.filter((t) => t.status === 'running');
  const failed = sorted.filter((t) => t.status === 'failed');
  const pending = sorted.filter((t) => t.status === 'pending');

  const progress = `Progress: ${completed.length}/${sorted.length} done${failed.length > 0 ? ` · ${failed.length} failed` : ''}${running.length > 0 ? ` · ${running.length} in progress` : ''}`;

  const formatTask = (task: RalphLoopTask): string => {
    const icon = STATUS_ICONS[task.status] ?? '⏳';
    const titleLink = `[**${task.title}**](${task.id})`;

    if (task.status === 'completed') {
      return `- ${icon} ${titleLink} — ${task.outcome ?? 'done'}`;
    }
    if (task.status === 'failed') {
      return `- ${icon} ${titleLink} — FAILED${task.outcome ? `: ${task.outcome}` : ''}`;
    }
    if (task.status === 'running') {
      return `- ${icon} ${titleLink} — IN PROGRESS`;
    }
    const desc = task.description
      ? `\n  ${task.description.length > 120 ? `${task.description.slice(0, 120)}…` : task.description}`
      : '';
    return `- ${icon} ${titleLink}${desc}`;
  };

  return [progress, '', ...sorted.map(formatTask)].join('\n');
};

const buildLearningsSection = (tasks: RalphLoopTask[]): string => {
  const sorted = [...tasks].sort((a, b) => a.order - b.order);
  const completedWithLearnings = sorted.filter(
    (t) => t.status === 'completed' && t.learnings,
  );

  if (completedWithLearnings.length === 0) return '';

  return `\n## Learnings from completed tasks\n${completedWithLearnings
    .map((t) => `### ${t.title}\n${t.learnings}`)
    .join('\n\n')}\n`;
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
    .filter((t) => t.status === 'pending')
    .sort((a, b) => a.order - b.order);

  return `${loop.prompt ?? ''}

## Task Status
${buildTaskListSection(tasks)}
${buildLearningsSection(tasks)}
## What to do

${
  pendingTasks.length === 1
    ? `👉 One task remaining: [**${pendingTasks[0]!.title}**](${pendingTasks[0]!.id})`
    : `👉 ${pendingTasks.length} tasks pending — pick the highest-priority one (respect dependencies).`
}

1. Call \`claimTask\` with the task id
2. Implement the task thoroughly
3. If there are any changes, commit them: \`git add -A && git commit -m "task: <title>"\`
4. Call \`taskDone\` with outcome + learnings

⚠️ You MUST call \`taskDone\` to signal completion. Work on exactly one task.`.trim();
};
