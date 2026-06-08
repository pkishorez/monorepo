import { Effect } from 'effect';
import type { EntityType } from '@std-toolkit/core';
import { collectionRegistry } from '@std-toolkit/tanstack';
import { vdescribe, vtest } from '@monorepo/vtest';

const envelope = (entityType: string, id: string): EntityType<any> => ({
  value: { id, name: id },
  meta: { _v: 'v1', _e: entityType, _d: false, _u: '2024-01-01' },
});

const broadcast = (values: EntityType<any>[]) => ({
  _tag: '@std-toolkit/broadcast' as const,
  values,
});

const fakeCollection = (entityName: string) => {
  const upserted: EntityType<any>[] = [];
  const utils = {
    upsert: (item: EntityType<any>) => {
      upserted.push(item);
    },
    schema: () => ({ name: entityName }) as any,
    fetchAll: () => Effect.succeed(0),
  };
  return { input: { utils }, upserted };
};

vdescribe(
  'the registry routes broadcasts by entity type',
  'each envelope reaches the collection whose schema name matches _e',
  () => {
    vtest(
      'an envelope is upserted into the matching collection only',
      'matching is by the _e type carried in the envelope meta',
      () => {
        const tasks = fakeCollection('Task');
        const users = fakeCollection('User');
        const registry = collectionRegistry
          .create()
          .add(tasks.input)
          .add(users.input)
          .build();

        registry.process(broadcast([envelope('Task', 't1')]));

        if (tasks.upserted.length !== 1) throw new Error('Task not routed');
        if (users.upserted.length !== 0) throw new Error('User wrongly routed');
        if (tasks.upserted[0]!.value.id !== 't1') throw new Error('wrong item');
      },
    );

    vtest(
      'process ignores malformed messages without throwing',
      'a junk push never crashes the UI',
      () => {
        const registry = collectionRegistry.create().build();
        for (const bad of [null, undefined, {}, { _tag: 'nope' }, 'x', 7]) {
          registry.process(bad);
        }
      },
    );

    vtest(
      'fetchAll is an Effect refreshing every registered collection',
      'one call refetches all collections and single items at once',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const a = fakeCollection('Task');
            const b = fakeCollection('User');
            const registry = collectionRegistry
              .create()
              .add(a.input)
              .add(b.input)
              .build();
            const counts = yield* registry.fetchAll;
            if (counts.length !== 2) throw new Error(`got ${counts.length}`);
          }),
        ),
    );
  },
);
