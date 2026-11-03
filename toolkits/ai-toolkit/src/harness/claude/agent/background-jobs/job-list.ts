import type { BackgroundJob } from '../../../contract/index.js';

/** One task as `system/background_tasks_changed` lists it. */
export interface ListedTask {
  readonly task_id: string;
  readonly task_type: string;
  readonly description: string;
  readonly ambient?: boolean;
}

const SHELL_TASKS = new Set(['local_bash', 'monitor', 'local_monitor']);

const kindOf = (taskType: string): BackgroundJob['kind'] =>
  SHELL_TASKS.has(taskType) ? 'shell' : 'agent';

/**
 * The tool call that started each task, by task id: `task_started` names
 * it, and a snapshot does not, so it is kept apart, as either may come
 * first.
 */
export type Links = Map<string, string>;

/** A job with what it had: its tokens so far, until a progress says more. */
const kept = (
  job: BackgroundJob,
  previous: BackgroundJob | undefined,
): BackgroundJob =>
  previous?.tokens === undefined ? job : { ...job, tokens: previous.tokens };

/** A job with its tool call, when one is known. */
const linked = (job: BackgroundJob, links: Links): BackgroundJob => {
  const toolCallId = links.get(job.id);
  return toolCallId === undefined || job.toolCallId === toolCallId
    ? job
    : { ...job, toolCallId };
};

/**
 * The job list after a `background_tasks_changed` snapshot: it replaces the
 * list. Housekeeping (`ambient`) tasks are not jobs. A job keeps the time it
 * was first listed, and its tokens so far; a new one starts `now`.
 */
export const fromSnapshot = (
  previous: ReadonlyArray<BackgroundJob>,
  tasks: ReadonlyArray<ListedTask>,
  now: number,
  links: Links = new Map(),
): ReadonlyArray<BackgroundJob> =>
  tasks
    .filter((task) => task.ambient !== true)
    .map((task) => {
      const was = previous.find((job) => job.id === task.task_id);
      return linked(
        kept(
          {
            id: task.task_id,
            kind: kindOf(task.task_type),
            title: task.description,
            startedAt: was?.startedAt ?? now,
          },
          was,
        ),
        links,
      );
    });

/** The job list once a task has ended, before the next snapshot says so. */
export const ended = (
  previous: ReadonlyArray<BackgroundJob>,
  taskId: string,
): ReadonlyArray<BackgroundJob> =>
  previous.some((job) => job.id === taskId)
    ? previous.filter((job) => job.id !== taskId)
    : previous;

const isObj = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null;

const isListedTask = (value: unknown): value is ListedTask =>
  isObj(value) &&
  typeof value['task_id'] === 'string' &&
  typeof value['task_type'] === 'string' &&
  typeof value['description'] === 'string';

const ENDED = new Set(['completed', 'failed', 'killed', 'stopped']);

/**
 * The job list after one record the query yields; unchanged for most.
 * `links` learns each task's tool call from `task_started`.
 */
export const next = (
  previous: ReadonlyArray<BackgroundJob>,
  record: Readonly<Record<string, unknown>>,
  now: number,
  links: Links = new Map(),
): ReadonlyArray<BackgroundJob> => {
  if (record['type'] !== 'system') return previous;
  const taskId = record['task_id'];
  switch (record['subtype']) {
    case 'background_tasks_changed':
      return Array.isArray(record['tasks'])
        ? fromSnapshot(
            previous,
            record['tasks'].filter(isListedTask),
            now,
            links,
          )
        : previous;
    case 'task_started': {
      const toolUseId = record['tool_use_id'];
      if (typeof taskId !== 'string' || typeof toolUseId !== 'string')
        return previous;
      links.set(taskId, toolUseId);
      return previous.some((job) => job.id === taskId)
        ? previous.map((job) => (job.id === taskId ? linked(job, links) : job))
        : previous;
    }
    case 'task_progress': {
      const usage = record['usage'];
      const tokens = isObj(usage) ? usage['total_tokens'] : undefined;
      return typeof taskId === 'string' &&
        typeof tokens === 'number' &&
        previous.some((job) => job.id === taskId && job.tokens !== tokens)
        ? previous.map((job) => (job.id === taskId ? { ...job, tokens } : job))
        : previous;
    }
    case 'task_notification':
      if (typeof taskId === 'string') links.delete(taskId);
      return typeof taskId === 'string' ? ended(previous, taskId) : previous;
    case 'task_updated': {
      const patch = record['patch'];
      return typeof taskId === 'string' &&
        isObj(patch) &&
        typeof patch['status'] === 'string' &&
        ENDED.has(patch['status'])
        ? ended(previous, taskId)
        : previous;
    }
    default:
      return previous;
  }
};
