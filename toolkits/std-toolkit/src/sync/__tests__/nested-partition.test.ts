import { createLiveQueryCollection, eq } from '@tanstack/react-db';
import { Effect, Schema } from 'effect';
import { expect, it, vi } from 'vitest';
import { EntityESchema } from '../../eschema/index.js';
import { resolvePartitionKey } from '../collection/keyed-collection/hybrid-sync/hybrid-sync.js';
import { noStrategyState } from '../strategy/state/index.js';
import { createStdSync } from '../std-sync/std-sync.js';

const taskSchema = EntityESchema.make('Task', 'id', {
  board: Schema.Struct({ id: Schema.String }),
  userId: Schema.String,
  owner: Schema.Struct({ userId: Schema.String }),
  title: Schema.String,
}).build();

const filterOn = (path: readonly string[], value: unknown) => ({
  where: {
    type: 'func' as const,
    name: 'eq' as const,
    args: [
      { type: 'ref' as const, path },
      { type: 'val' as const, value },
    ],
  },
});

it('names a partition by its whole key path', () => {
  const paths = ['board.id', 'userId'];
  expect(
    resolvePartitionKey(filterOn(['board', 'id'], 'work') as never, paths),
  ).toMatchObject({ field: 'board.id', partitionValue: 'work' });
  expect(
    resolvePartitionKey(filterOn(['userId'], 'u1') as never, paths),
  ).toMatchObject({ field: 'userId', partitionValue: 'u1' });
  // `owner.userId` is a different path, even though it ends in `userId`.
  expect(
    resolvePartitionKey(filterOn(['owner', 'userId'], 'u1') as never, paths),
  ).toBeNull();
});

it('starts the partition a live query names through a nested field', async () => {
  const started: string[] = [];
  const std = createStdSync({ name: 'nested-partitions' });
  const tasks = std.collection({
    schema: taskSchema,
    sync: {
      partitions: {
        'board.id': (boardId) => ({
          strategy: {
            name: 'board',
            state: noStrategyState(),
            run: () => Effect.sync(() => started.push(boardId)),
          },
        }),
      },
    },
  });
  const screen = createLiveQueryCollection({
    query: (q) =>
      q.from({ task: tasks }).where(({ task }) => eq(task.board.id, 'work')),
    startSync: true,
    gcTime: 0,
  });

  try {
    void screen.preload();
    await vi.waitFor(() => expect(started).toEqual(['work']));
  } finally {
    await screen.cleanup();
    await std.dispose();
  }
});
