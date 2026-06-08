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

vdescribe(
  'syncMode decides how a collection fills itself',
  'eager loads up front; on-demand and progressive load on query',
  () => {
    vtest(
      'eager omits syncMode and starts sync',
      'eager is the default-feeling mode: startSync true, no explicit syncMode',
      () => {
        const c = stdCollectionOptions({
          schema: TaskSchema,
          syncMode: 'eager',
          getMore: () => Effect.succeed([]),
          onInsert: (i) => Effect.succeed(envelope({ ...i, id: 'g' })),
        });
        if ('syncMode' in c) throw new Error('eager should omit syncMode');
        if (c.startSync !== true) throw new Error('eager should startSync');
      },
    );

    vtest(
      'on-demand surfaces as syncMode on-demand',
      'nothing loads until a query asks via onLoadSubset',
      () => {
        const c = stdCollectionOptions({
          schema: TaskSchema,
          syncMode: 'on-demand',
          onLoadSubset: () => Effect.succeed([]),
          onInsert: (i) => Effect.succeed(envelope({ ...i, id: 'g' })),
        });
        if (c.syncMode !== 'on-demand') throw new Error('expected on-demand');
        if (c.startSync !== false)
          throw new Error('on-demand should not startSync');
      },
    );

    vtest(
      'progressive also surfaces as on-demand at the sync boundary',
      'eager paging plus on-demand queries look identical to TanStack',
      () => {
        const c = stdCollectionOptions({
          schema: TaskSchema,
          syncMode: 'progressive',
          getMore: () => Effect.succeed([]),
          onLoadSubset: () => Effect.succeed([]),
          onInsert: (i) => Effect.succeed(envelope({ ...i, id: 'g' })),
        });
        if (c.syncMode !== 'on-demand') throw new Error('expected on-demand');
      },
    );
  },
);
