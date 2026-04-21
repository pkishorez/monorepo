import { Schema } from 'effect';

export const TaskStatus = Schema.Literal(
  'in_progress',
  'queued',
  'success',
  'error',
  'interrupted',
);
export type TaskStatus = typeof TaskStatus.Type;
