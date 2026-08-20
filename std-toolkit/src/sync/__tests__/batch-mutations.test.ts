import 'fake-indexeddb/auto';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import type { DecodedEntity } from '../../core/index.js';
import { EntityESchema } from '../../eschema/index.js';
import { createStdSync } from '../sync.js';

type Todo = { id: string; title: string };

const todoSchema = EntityESchema.make('Todo', 'id', {
  title: Schema.String,
}).build();

const todo = (
  id: string,
  updated: string,
  title = `title ${updated}`,
  deleted = false,
): DecodedEntity<Todo> => ({
  value: { id, title },
  meta: { _e: 'Todo', _d: deleted, _u: updated },
});

describe('batched mutations', () => {
  it('runs the user Effect for every mutation in one transaction', async () => {
    const inserted: string[] = [];
    const updated: string[] = [];
    const deleted: string[] = [];
    const std = createStdSync({ name: 'batch-handlers', peerSync: false });
    const config = std.sync({
      schema: todoSchema,
      onInsert: (item) =>
        Effect.sync(() => {
          inserted.push(item.id);
          return todo(item.id, '2', item.title);
        }),
      onUpdate: ({ current, updates }) =>
        Effect.sync(() => {
          updated.push(current.id);
          return todo(current.id, '3', updates.title ?? current.title);
        }),
      onDelete: ({ current }) =>
        Effect.sync(() => {
          deleted.push(current.id);
          return todo(current.id, '4', current.title, true);
        }),
    });

    await config.onInsert!({
      transaction: {
        mutations: [
          { key: 'a', modified: { id: 'a', title: 'A' } },
          { key: 'b', modified: { id: 'b', title: 'B' } },
          { key: 'c', modified: { id: 'c', title: 'C' } },
        ],
      },
    } as never);
    expect(inserted).toEqual(['a', 'b', 'c']);

    await config.onUpdate!({
      transaction: {
        mutations: [
          {
            key: 'a',
            original: { id: 'a', title: 'A' },
            changes: { title: 'A2' },
          },
          {
            key: 'b',
            original: { id: 'b', title: 'B' },
            changes: { title: 'B2' },
          },
        ],
      },
    } as never);
    expect(updated).toEqual(['a', 'b']);

    await config.onDelete!({
      transaction: {
        mutations: [
          { key: 'a', original: { id: 'a', title: 'A2' } },
          { key: 'b', original: { id: 'b', title: 'B2' } },
          { key: 'c', original: { id: 'c', title: 'C' } },
        ],
      },
    } as never);
    expect(deleted).toEqual(['a', 'b', 'c']);

    await std.dispose();
  });

  it('flushes every confirmed entity of a batch into the Sync Replica', async () => {
    const std = createStdSync({ name: 'batch-replica', peerSync: false });
    const config = std.sync({
      schema: todoSchema,
      onInsert: (item) => Effect.succeed(todo(item.id, '2', item.title)),
    });

    await config.onInsert!({
      transaction: {
        mutations: [
          { key: 'a', modified: { id: 'a', title: 'A' } },
          { key: 'b', modified: { id: 'b', title: 'B' } },
        ],
      },
    } as never);

    const replica = await Effect.runPromise(
      config.utils.applyToSyncReplica([todo('a', '1'), todo('b', '1')]),
    );
    expect(replica).toEqual([]);

    await std.dispose();
  });

  it('bounds backend concurrency at five in-flight mutations', async () => {
    let inFlight = 0;
    let peak = 0;
    const std = createStdSync({ name: 'batch-concurrency', peerSync: false });
    const config = std.sync({
      schema: todoSchema,
      onInsert: (item) =>
        Effect.gen(function* () {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          yield* Effect.sleep('10 millis');
          inFlight -= 1;
          return todo(item.id, '2', item.title);
        }),
    });

    await config.onInsert!({
      transaction: {
        mutations: Array.from({ length: 20 }, (_, index) => ({
          key: `k${index}`,
          modified: { id: `k${index}`, title: `T${index}` },
        })),
      },
    } as never);

    expect(peak).toBe(5);

    await std.dispose();
  });
});
