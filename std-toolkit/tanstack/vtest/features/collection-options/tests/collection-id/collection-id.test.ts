import { Effect, Schema } from 'effect';
import { EntityESchema } from '@std-toolkit/eschema';
import type { EntityType } from '@std-toolkit/core';
import { stdCollectionOptions } from '@std-toolkit/tanstack';
import { vdescribe, vtest } from '@monorepo/vtest';

const TaskSchema = EntityESchema.make('Task', 'id', {
  title: Schema.String,
}).build();

type Task = typeof TaskSchema.Type;

const envelope = (value: Task): EntityType<Task> => ({
  value,
  meta: { _v: 'v1', _e: 'Task', _d: false, _u: new Date().toISOString() },
});

const make = (id?: string) =>
  stdCollectionOptions({
    ...(id !== undefined && { id }),
    schema: TaskSchema,
    syncMode: 'eager',
    getMore: () => Effect.succeed([]),
    onInsert: (i) => Effect.succeed(envelope({ ...i, id: 'g' })),
  });

vdescribe(
  'a collection can carry a stable id',
  'id is optional and flows straight through to the config',
  () => {
    vtest(
      'omitting id leaves it off the config',
      'a collection is anonymous by default',
      () => {
        if ('id' in make()) throw new Error('expected no id');
      },
    );

    vtest(
      'a provided id passes through unchanged',
      'two collections of the same schema can be told apart',
      () => {
        const c = make('tasks-sidebar');
        if (c.id !== 'tasks-sidebar') throw new Error(`got ${c.id}`);
      },
    );
  },
);
