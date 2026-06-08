import { Effect, Schema } from 'effect';
import { EntityESchema } from '@std-toolkit/eschema';
import { MemoryCacheEntity } from '@std-toolkit/cache/memory';
import { stdPartitionedCollectionOptions } from '@std-toolkit/tanstack';
import { vdescribe, vtest } from '@monorepo/vtest';

const TaskSchema = EntityESchema.make('Task', 'id', {
  title: Schema.String,
  workspaceId: Schema.String,
}).build();

type Task = typeof TaskSchema.Type;

const config = () =>
  stdPartitionedCollectionOptions({
    schema: TaskSchema,
    partitionField: 'workspaceId',
    cache: () => MemoryCacheEntity.make<Task>({ name: 'Task', idField: 'id' }),
    onLoadPartition: () => Effect.succeed([]),
  });

vdescribe(
  'a partitioned collection loads one slice at a time',
  'records share a schema but are stored and loaded per partition field',
  () => {
    vtest(
      'the config is always on-demand',
      'eagerly loading every partition makes no sense',
      () => {
        if (config().syncMode !== 'on-demand') {
          throw new Error('expected on-demand');
        }
      },
    );

    vtest(
      'getKey still extracts the schema id field',
      'partitioning changes where records live, not how they are keyed',
      () => {
        const key = config().getKey({
          id: 'task-9',
          title: 'x',
          workspaceId: 'w1',
        });
        if (key !== 'task-9') throw new Error(`got ${key}`);
      },
    );

    vtest(
      'fetch without a partition is a no-op returning zero',
      'there is nothing to load until you name a slice',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const count = yield* config().utils!.fetch();
            if (count !== 0) throw new Error(`expected 0, got ${count}`);
          }),
        ),
    );
  },
);
