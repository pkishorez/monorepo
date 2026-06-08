import { Effect, Schema, SubscriptionRef } from 'effect';
import { EntityESchema } from '@std-toolkit/eschema';
import type { EntityType } from '@std-toolkit/core';
import { stdCollectionOptions } from '@std-toolkit/tanstack';
import { vdescribe, vtest } from '@monorepo/vtest';

const TestSchema = EntityESchema.make('Task', 'id', {
  title: Schema.String,
}).build();

type TestItem = typeof TestSchema.Type;

const envelope = (value: TestItem): EntityType<TestItem> => ({
  value,
  meta: { _v: 'v1', _e: 'Task', _d: false, _u: new Date().toISOString() },
});

const config = () =>
  stdCollectionOptions({
    syncMode: 'eager',
    schema: TestSchema,
    getMore: () => Effect.succeed([]),
    onInsert: (item) => Effect.succeed(envelope({ ...item, id: 'generated' })),
  });

vdescribe(
  'a factory returns inspectable collection options',
  'calling the factory starts nothing — it produces a plain config object',
  () => {
    vtest(
      'the config exposes the fields TanStack DB needs',
      'getKey, compare, sync and utils are all present without a running app',
      () => {
        const c = config();
        if (typeof c.getKey !== 'function') throw new Error('getKey missing');
        if (typeof c.compare !== 'function') throw new Error('compare missing');
        if (typeof c.sync.sync !== 'function') throw new Error('sync missing');
        if (!c.utils) throw new Error('utils missing');
      },
    );

    vtest(
      'getKey reads the schema id field from an item',
      'the key comes from the envelope value, not from TanStack',
      () => {
        const c = config();
        const key = c.getKey({ id: 'abc-123', title: 'x' });
        if (key !== 'abc-123') throw new Error(`got ${key}`);
      },
    );

    vtest(
      'compare orders two items by their _u update key',
      'newest sorts last, so collections render in recency order for free',
      () => {
        const compare = config().compare!;
        const older = {
          id: '1',
          title: 'a',
          _meta: { _v: 'v1', _e: 'Task', _d: false, _u: '2024-01-01' },
        };
        const newer = {
          id: '2',
          title: 'b',
          _meta: { _v: 'v1', _e: 'Task', _d: false, _u: '2024-02-01' },
        };
        if (compare(older, newer) !== -1)
          throw new Error('older should be < newer');
        if (compare(newer, older) !== 1)
          throw new Error('newer should be > older');
      },
    );

    vtest(
      'isSyncing starts false',
      'a fresh config has not begun syncing — nothing runs until TanStack asks',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const syncing = yield* SubscriptionRef.get(
              config().utils!.isSyncing(),
            );
            if (syncing !== false) throw new Error('expected not syncing');
          }),
        ),
    );
  },
);
