import { Effect, Schema } from 'effect';
import { EntityESchema } from '@std-toolkit/eschema';
import { createStdSync } from '@std-toolkit/tanstack-sync';
import { vdescribe, vtest } from '@monorepo/vtest';

const TaskSchema = EntityESchema.make('Task', 'id', {
  title: Schema.String,
}).build();

vdescribe(
  'createStdSync builds inspectable configs without doing any I/O',
  'one factory, four shapes, shared option defaults — and nothing runs yet',
  () => {
    vtest(
      'exposes the four sync shapes',
      'totalSync, onDemand, singleItem and registry are all present',
      () => {
        const std = createStdSync();
        for (const key of ['totalSync', 'onDemand', 'singleItem', 'registry']) {
          if (typeof (std as Record<string, unknown>)[key] !== 'function')
            throw new Error(`expected ${key} to be a function`);
        }
      },
    );

    vtest(
      'building a collection starts no sync',
      'the factory is pure config: getKey/sync/utils exist before anything runs',
      () => {
        const config = createStdSync().totalSync({
          schema: TaskSchema,
          query: () => Effect.succeed([]),
        });
        if (typeof config.getKey !== 'function')
          throw new Error('expected a getKey function');
        if (typeof config.utils.upsert !== 'function')
          throw new Error('expected utils.upsert');
        if (typeof config.sync.sync !== 'function')
          throw new Error('expected a sync entry point');
      },
    );

    vtest(
      'shared options defaults flow into every collection',
      'options passed to createStdSync are merged into each built config',
      () => {
        const std = createStdSync({ options: { gcTime: 5000 } });
        const config = std.totalSync({
          schema: TaskSchema,
          query: () => Effect.succeed([]),
        });
        if ((config as { gcTime?: number }).gcTime !== 5000)
          throw new Error('default gcTime should flow into the collection');
      },
    );

    vtest(
      'per-collection options override the shared defaults',
      'a shallow merge lets one collection opt out of an inherited default',
      () => {
        const std = createStdSync({ options: { gcTime: 5000 } });
        const config = std.totalSync({
          schema: TaskSchema,
          options: { gcTime: 1000 },
          query: () => Effect.succeed([]),
        });
        if ((config as { gcTime?: number }).gcTime !== 1000)
          throw new Error('per-collection options should win');
      },
    );
  },
);
