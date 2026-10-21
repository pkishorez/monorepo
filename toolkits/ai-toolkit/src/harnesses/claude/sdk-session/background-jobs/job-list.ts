import type { BackgroundJob } from '../../../../harness/index.js';

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
 * The job list after a `background_tasks_changed` snapshot: it replaces the
 * list. Housekeeping (`ambient`) tasks are not jobs. A job keeps the time it
 * was first listed; a new one starts `now`.
 */
export const fromSnapshot = (
  previous: ReadonlyArray<BackgroundJob>,
  tasks: ReadonlyArray<ListedTask>,
  now: number,
): ReadonlyArray<BackgroundJob> =>
  tasks
    .filter((task) => task.ambient !== true)
    .map((task) => ({
      id: task.task_id,
      kind: kindOf(task.task_type),
      title: task.description,
      startedAt:
        previous.find((job) => job.id === task.task_id)?.startedAt ?? now,
    }));

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

/** The job list after one record the query yields; unchanged for most. */
export const next = (
  previous: ReadonlyArray<BackgroundJob>,
  record: Readonly<Record<string, unknown>>,
  now: number,
): ReadonlyArray<BackgroundJob> => {
  if (record['type'] !== 'system') return previous;
  const taskId = record['task_id'];
  switch (record['subtype']) {
    case 'background_tasks_changed':
      return Array.isArray(record['tasks'])
        ? fromSnapshot(previous, record['tasks'].filter(isListedTask), now)
        : previous;
    case 'task_notification':
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
