import { Schema } from 'effect';
import { EntityESchema } from '@kestack/std-toolkit/schema';

export const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
  .evolve('v3', { done: Schema.Boolean }, (v2) => ({ ...v2, done: false }))
  // Release 4 renames title to name: remove one, add the other, and the
  // migration carries the value across.
  .evolve('v4', { title: null, name: Schema.String }, ({ title, ...v3 }) => ({
    ...v3,
    name: title,
  }))
  // Release 5 removes done, and a status takes its place.
  .evolve(
    'v5',
    { done: null, status: Schema.Literals(['open', 'done']) },
    ({ done, ...v4 }) => ({
      ...v4,
      status: done ? ('done' as const) : ('open' as const),
    }),
  )
  .build();
