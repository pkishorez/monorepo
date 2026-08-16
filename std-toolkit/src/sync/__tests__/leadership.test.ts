import { Effect, Layer, Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { EntityESchema, ESchema } from '../../eschema/index.js';
import { serializePartition } from '../domain/partition-identity/index.js';
import { noStrategyState } from '../domain/strategy-state/index.js';
import {
  LeadershipService,
  leadershipIdentity,
  type LeadershipIdentity,
} from '../runtime/leadership/index.js';
import { inMemoryLeadership } from '../runtime/leadership/in-memory/index.js';
import { createStdSync } from '../sync.js';

const todoSchema = EntityESchema.make('Todo', 'id', {
  listId: Schema.String,
  title: Schema.String,
}).build();

const settingsSchema = ESchema.make('Settings', {
  theme: Schema.String,
}).build();

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
  let ready = 0;
  const subscription = collection.sync.sync({
    begin: () => undefined,
    write: () => undefined,
    commit: () => undefined,
    truncate: () => undefined,
    markReady: () => {
      ready += 1;
    },
    collection: {
      update: () => undefined,
      on: () => () => undefined,
      status: 'ready',
      size: 0,
      subscriberCount: 0,
    },
  } as never) as {
    cleanup: () => Promise<void>;
    loadSubset?: (options: typeof subset) => true;
  };
  return { ready: () => ready, subscription };
};

const strategy = (name: string, run: () => Effect.Effect<void>) => ({
  name,
  state: noStrategyState(),
  run,
});

describe('Leadership integration', () => {
  it('keeps one global strategy active and hands over after cleanup', async () => {
    const leadershipLayer = inMemoryLeadership();
    let attempts = 0;
    const makeCollection = () => {
      const std = createStdSync({
        name: 'shared',
        leadershipLayer,
        peerSync: false,
      });
      return {
        std,
        collection: std.sync({
          schema: todoSchema,
          sync: {
            total: {
              strategy: strategy('finite', () =>
                Effect.sync(() => {
                  attempts += 1;
                }),
              ),
            },
          },
        }),
      };
    };

    const first = makeCollection();
    const firstMount = mount(first.collection);
    await vi.waitFor(() => expect(attempts).toBe(1));

    const second = makeCollection();
    const secondMount = mount(second.collection);
    await vi.waitFor(() => expect(secondMount.ready()).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(attempts).toBe(1);

    await firstMount.subscription.cleanup();
    await vi.waitFor(() => expect(attempts).toBe(2));
    await secondMount.subscription.cleanup();
    await first.std.dispose();
    await second.std.dispose();
  });

  it('assigns separate exact identities to strategy and Cadence Repair roles', async () => {
    const identities: LeadershipIdentity[] = [];
    const leadershipLayer = Layer.succeed(LeadershipService, {
      run: (identity, effect) =>
        Effect.sync(() => identities.push(identity)).pipe(
          Effect.andThen(effect),
        ),
    });
    const std = createStdSync({
      name: 'roles',
      leadershipLayer,
      peerSync: false,
      cadence: { window: 1_000, readiness: 1_000, pollDelay: 1_000 },
    });
    const repair = { fetchFrom: () => Effect.succeed([]) };
    const keyed = std.sync({
      schema: todoSchema,
      sync: {
        total: {
          strategy: strategy('total', () => Effect.void),
          repair,
        },
        partitions: {
          listId: () => ({
            strategy: strategy('partition', () => Effect.void),
            repair,
          }),
        },
      },
    });
    const singleton = std.singleItemSync({
      schema: settingsSchema,
      strategy: strategy('single', () => Effect.void),
    });

    const keyedMount = mount(keyed);
    const singleMount = mount(singleton);
    keyedMount.subscription.loadSubset?.(subset);
    await vi.waitFor(() => expect(identities).toHaveLength(5));

    const collectionName = 'roles.todo';
    const partitionKey = serializePartition({ listId: 'inbox' });
    expect(new Set(identities)).toEqual(
      new Set([
        leadershipIdentity({
          collectionName,
          partitionKey: '__total__',
          role: { _tag: 'Strategy', name: 'total' },
        }),
        leadershipIdentity({
          collectionName,
          partitionKey: '__total__',
          role: { _tag: 'CadenceRepair' },
        }),
        leadershipIdentity({
          collectionName,
          partitionKey,
          role: { _tag: 'Strategy', name: 'partition' },
        }),
        leadershipIdentity({
          collectionName,
          partitionKey,
          role: { _tag: 'CadenceRepair' },
        }),
        leadershipIdentity({
          collectionName: 'roles.settings',
          partitionKey: '__single__',
          role: { _tag: 'Strategy', name: 'single' },
        }),
      ]),
    );

    await keyedMount.subscription.cleanup();
    await singleMount.subscription.cleanup();
    await std.dispose();
  });
});
