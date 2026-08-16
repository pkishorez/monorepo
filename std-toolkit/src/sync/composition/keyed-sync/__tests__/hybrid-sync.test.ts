import { Context, Effect, Layer, ManagedRuntime, Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import type { EntityType } from '../../../../core/index.js';
import { EntityESchema } from '../../../../eschema/index.js';
import { noStrategyState } from '../../../domain/strategy-state/index.js';
import { createStdSync } from '../../../sync.js';

type Todo = { id: string; listId: string; title: string };

const schema = EntityESchema.make('Todo', 'id', {
  listId: Schema.String,
  title: Schema.String,
}).build();

const entity = (title: string, updated: string): EntityType<Todo> => ({
  value: { id: 'todo-1', listId: 'inbox', title },
  meta: { _e: 'Todo', _v: 'v1', _u: updated, _d: false },
});

const subset = {
  where: {
    type: 'func' as const,
    name: 'eq' as const,
    args: [
      { type: 'ref' as const, path: ['todos', 'listId'] },
      { type: 'val' as const, value: 'inbox' },
    ],
  },
};

const mount = (collection: {
  sync: { sync: (callbacks: never) => unknown };
}) => {
  const events: unknown[] = [];
  const probe = { readyCount: 0 };
  const callbacks = {
    begin: () => events.push('begin'),
    write: (operation: unknown) => events.push(operation),
    commit: () => events.push('commit'),
    truncate: () => undefined,
    markReady: () => {
      probe.readyCount += 1;
      events.push('ready');
    },
    collection: {
      update: () => undefined,
      on: () => () => undefined,
      status: 'ready',
      size: 0,
      subscriberCount: 0,
    },
  };
  const subscription = collection.sync.sync(callbacks as never) as {
    cleanup: () => void | Promise<void>;
    loadSubset: (options: typeof subset) => true;
  };
  return { events, probe, subscription };
};

class RuntimeProbe extends Context.Service<
  RuntimeProbe,
  { record: (worker: string) => void }
>()('sync/tests/runtime-probe') {}

describe('hybrid sync', () => {
  it('runs total and partition workers through the supplied runtime', async () => {
    const workers: string[] = [];
    const runtime = ManagedRuntime.make(
      Layer.succeed(RuntimeProbe, { record: (worker) => workers.push(worker) }),
    );
    const worker = (name: string) => ({
      name,
      state: noStrategyState(),
      run: () =>
        Effect.gen(function* () {
          const probe = yield* RuntimeProbe;
          probe.record(name);
        }),
    });
    const collection = createStdSync({ name: 'hybrid', runtime }).sync({
      schema,
      sync: {
        total: {
          strategy: worker('total'),
        },
        partitions: {
          listId: () => ({
            strategy: worker('partition'),
          }),
        },
      },
    });
    const { probe, subscription } = mount(collection);

    await vi.waitFor(() => expect(workers).toContain('total'));
    subscription.loadSubset(subset);

    await vi.waitFor(() => expect(workers).toContain('partition'));
    expect(probe.readyCount).toBe(1);
    await subscription.cleanup();
    await runtime.dispose();
  });

  it('converges overlapping total and partition results through one SoT', async () => {
    const worker = (name: string, result: EntityType<Todo>) => ({
      name,
      state: noStrategyState(),
      run: (ctx: {
        writeServerTruth: (
          entities: EntityType<Todo>[],
        ) => Effect.Effect<void, unknown>;
      }) => ctx.writeServerTruth([result]),
    });
    const collection = createStdSync({ name: 'hybrid' }).sync({
      schema,
      sync: {
        total: {
          strategy: worker('total', entity('older', '1')),
        },
        partitions: {
          listId: () => ({
            strategy: worker('partition', entity('newer', '2')),
          }),
        },
      },
    });
    const { events, subscription } = mount(collection);

    await vi.waitFor(() =>
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'update',
          value: expect.objectContaining({ title: 'older' }),
        }),
      ),
    );
    subscription.loadSubset(subset);

    await vi.waitFor(() =>
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'update',
          value: expect.objectContaining({ title: 'newer' }),
        }),
      ),
    );
    await subscription.cleanup();
  });
});
