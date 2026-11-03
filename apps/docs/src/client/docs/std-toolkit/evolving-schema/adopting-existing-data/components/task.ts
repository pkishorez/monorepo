import { Schema } from 'effect';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

// The shape your rows already have, written down as v1. Nothing else.
const v1 = { boardId: Schema.String, title: Schema.String };

// Release A: adopt. One version, so every old row reads as it always did.
export const TaskAdopted = EntityESchema.make('Task', 'taskId', v1).build();

// A later release: now versions can be added, and old rows come along.
export const Task = EntityESchema.make('Task', 'taskId', v1)
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
  .evolve('v3', { done: Schema.Boolean }, (v2) => ({ ...v2, done: false }))
  .build();
