import { Effect, Schema } from 'effect';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { describe } from 'vitest';

import type { EntityType } from '../../../core/index.js';
import { EntityESchema } from '../../../eschema/index.js';
import { createStdSync } from '../../index.js';
import { memoryOfflineStorage } from '../../offline-storage/memory-offline-storage.js';
import { offlineStorageGroupName } from '../../offline-storage/group-name.js';

interface Todo {
  readonly id: string;
  readonly listId: string;
  readonly title: string;
}

const todoSchema = EntityESchema.make('DocumentedTodo', 'id', {
  listId: Schema.String,
  title: Schema.String,
}).build();

const todo = (
  id: string,
  updated: string,
  overrides: Partial<Todo> = {},
  deleted = false,
): EntityType<Todo> => ({
  value: {
    id,
    listId: 'inbox',
    title: `Todo ${id}`,
    ...overrides,
  },
  meta: {
    _e: 'DocumentedTodo',
    _v: 'v1',
    _u: updated,
    _d: deleted,
  },
});

const makeHarness = () => {
  const storage = memoryOfflineStorage();
  const collection = createStdSync({ offlineStorage: storage }).sync({
    schema: todoSchema,
  });
  const sourceOfTruth = storage.group(
    offlineStorageGroupName.sourceOfTruth(todoSchema.name),
  );
  return { collection, sourceOfTruth };
};

describe('TanStack Sync', () => {
  laymosDescribe(
    'Source of truth',
    {
      description:
        'The source of truth retains the newest server-confirmed entity independently from the mounted TanStack collection.',
      documentation: `
A TanStack collection is a UI projection. The source of truth is the
server-confirmed state that projection is built from. Keeping them separate
lets std-sync accept broadcasts and mutation results while a collection is
unmounted, restore durable state after reload, and rebuild the visible
collection without treating optimistic UI state as confirmed data.

Convergence is deliberately small: for one entity identity, the greater
lexicographic \`_u\` wins. An older valid entity is a successful no-op. A newer
\`_d: true\` entity is a tombstone: it disappears from the visible projection
but remains in source-of-truth storage so an older live response cannot
resurrect it.

\`\`\`ts
yield* collection.utils.writeUpsert(serverEntity)
yield* collection.utils.writeUpsert(serverTombstone)
\`\`\`

The entity's \`meta._e\` must match the collection schema and its value must
contain the schema's id field. Invalid ownership and missing identity are typed
\`WriteError\` failures. Persisted writes are atomic: storage failure is
reported rather than acknowledged as confirmed state.
      `,
    },
    () => {
      laymosTest(
        'Persists a server-confirmed entity while the collection is unmounted.',
        {
          description:
            'No UI callbacks are mounted. A registry or mutation result may still arrive, and writeUpsert should retain it so the next mount can project the confirmed todo.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const harness = makeHarness();
            const confirmed = todo('todo-1', '0002');

            yield* trace(harness.collection.utils.writeUpsert(confirmed));

            const stored = yield* harness.sourceOfTruth.get('todo-1');
            expect(
              stored,
              'The unmounted collection retains the confirmed todo in its source of truth.',
            ).toMatchObject(confirmed);
          }),
      );

      laymosTest(
        'Replaces an older confirmed entity with a newer one.',
        {
          description:
            'The source of truth contains cursor 0001. A server response at 0002 represents a later title and must become the stored winner.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const harness = makeHarness();
            yield* harness.collection.utils.writeUpsert(
              todo('todo-2', '0001', { title: 'Older title' }),
            );
            const newer = todo('todo-2', '0002', {
              title: 'Newer title',
            });

            yield* trace(harness.collection.utils.writeUpsert(newer));

            const stored = yield* harness.sourceOfTruth.get('todo-2');
            expect(
              stored,
              'The source of truth stores the entity with the greater update cursor.',
            ).toMatchObject(newer);
          }),
      );

      laymosTest(
        'Treats an older server response as a successful no-op.',
        {
          description:
            'Networks can deliver responses out of order. The source of truth already holds 0002, so a valid 0001 response should succeed without replacing current state or becoming an error.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const harness = makeHarness();
            const current = todo('todo-3', '0002', {
              title: 'Current title',
            });
            yield* harness.collection.utils.writeUpsert(current);

            yield* trace(
              harness.collection.utils.writeUpsert(
                todo('todo-3', '0001', { title: 'Stale title' }),
              ),
            );

            const stored = yield* harness.sourceOfTruth.get('todo-3');
            expect(
              stored,
              'A stale successful write leaves the newer confirmed entity untouched.',
            ).toMatchObject(current);
          }),
      );

      laymosTest(
        'Keeps a newer tombstone so stale live data cannot resurrect an item.',
        {
          description:
            'The todo was live at 0001 and deleted at 0002. The tombstone must remain durable even though projections hide it, because it is the evidence that wins over delayed live responses.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const harness = makeHarness();
            yield* harness.collection.utils.writeUpsert(todo('todo-4', '0001'));
            const tombstone = todo('todo-4', '0002', {}, true);

            yield* trace(harness.collection.utils.writeUpsert(tombstone));
            yield* harness.collection.utils.writeUpsert(
              todo('todo-4', '0001', { title: 'Delayed live value' }),
            );

            const stored = yield* harness.sourceOfTruth.get('todo-4');
            expect(
              stored,
              'The durable tombstone remains the newest confirmed state.',
            ).toMatchObject(tombstone);
          }),
      );

      laymosTest(
        'Rejects an entity owned by another collection.',
        {
          description:
            'A registry route or caller supplied an entity whose `_e` names a different type. Accepting it would mix domains inside one source-of-truth namespace, so the write must fail before storage.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const harness = makeHarness();
            const valid = todo('todo-5', '0001');
            const wrong = {
              ...valid,
              meta: { ...valid.meta, _e: 'AnotherEntity' },
            };

            const failure = yield* trace(
              harness.collection.utils.writeUpsert(wrong).pipe(Effect.flip),
            );

            expect(
              failure,
              'Wrong ownership reports the expected and received entity types.',
            ).toMatchObject({
              _tag: 'WrongEntity',
              expected: 'DocumentedTodo',
              received: 'AnotherEntity',
            });
          }),
      );
    },
  );
});
