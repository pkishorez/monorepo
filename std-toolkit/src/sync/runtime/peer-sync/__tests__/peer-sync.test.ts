import { Effect, Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import type { EntityType } from '../../../../core/index.js';
import { EntityESchema } from '../../../../eschema/index.js';
import type { SyncEvent } from '../../../domain/sync-event/index.js';
import { makeEffectRunner } from '../../effect-runner/index.js';
import {
  makePeerSync,
  type PeerChannel,
  type PeerChannelFactory,
} from '../peer-sync.js';

type Todo = { id: string; title: string };

const schema = EntityESchema.make('Todo', 'id', {
  title: Schema.String,
}).build();

const entity = (id: string): EntityType<Todo> => ({
  value: { id, title: `title ${id}` },
  meta: { _v: 'v1', _e: 'Todo', _d: false, _u: id },
});

const makeHarness = (options?: {
  apply?: (entities: EntityType<Todo>[]) => Effect.Effect<void, unknown>;
  factory?: PeerChannelFactory | null;
}) => {
  let receive: ((message: unknown) => void) | null = null;
  const sent: unknown[] = [];
  const names: string[] = [];
  let cleanupCount = 0;
  const events: SyncEvent[] = [];
  const channel: PeerChannel = {
    broadcast: async (message) => {
      sent.push(message);
    },
    subscribe: async (handler) => {
      receive = handler;
      return async () => {
        cleanupCount += 1;
        receive = null;
      };
    },
  };
  const factory: PeerChannelFactory =
    options?.factory ??
    ((name) => {
      names.push(name);
      return channel;
    });
  const peer = makePeerSync<Todo>({
    collectionName: 'acme.todo',
    schema,
    runner: makeEffectRunner(undefined),
    report: (event) => Effect.sync(() => events.push(event)),
    apply: (entities) => options?.apply?.(entities) ?? Effect.void,
    channel: options?.factory === null ? null : factory,
  });
  return {
    peer,
    sent,
    names,
    events,
    channel,
    cleanupCount: () => cleanupCount,
    deliver: (message: unknown) => receive?.(message),
    subscribed: () => receive !== null,
  };
};

const waitForSubscription = async (harness: ReturnType<typeof makeHarness>) =>
  vi.waitFor(() => expect(harness.subscribed()).toBe(true));

describe('peer sync', () => {
  it('encodes and decodes a valid collection envelope', async () => {
    const applied: EntityType<Todo>[][] = [];
    const harness = makeHarness({
      apply: (entities) => Effect.sync(() => applied.push(entities)),
    });
    await harness.peer.broadcast([entity('1')]);

    expect(harness.names).toEqual(['acme.todo']);
    expect(harness.sent).toEqual([{ version: 1, entities: [entity('1')] }]);
    harness.deliver(harness.sent[0]);
    await vi.waitFor(() => expect(applied).toEqual([[entity('1')]]));
    await harness.peer.close();
    expect(harness.cleanupCount()).toBe(1);
  });

  it.each([
    ['empty entities', { version: 1, entities: [] }],
    ['version', { version: 2, entities: [entity('1')] }],
    [
      'value',
      {
        version: 1,
        entities: [{ ...entity('1'), value: { id: '1', title: 1 } }],
      },
    ],
    [
      'metadata',
      {
        version: 1,
        entities: [{ value: entity('1').value, meta: { _e: 'Todo' } }],
      },
    ],
    [
      'entity name',
      {
        version: 1,
        entities: [
          { ...entity('1'), meta: { ...entity('1').meta, _e: 'Other' } },
        ],
      },
    ],
  ])('reports and ignores an invalid %s', async (_label, message) => {
    const apply = vi.fn(() => Effect.void);
    const harness = makeHarness({ apply });
    await waitForSubscription(harness);
    harness.deliver(message);

    await vi.waitFor(() =>
      expect(harness.events).toContainEqual(
        expect.objectContaining({ _tag: 'PeerSyncFailed', phase: 'decode' }),
      ),
    );
    expect(apply).not.toHaveBeenCalled();
    await harness.peer.close();
  });

  it('reports an empty outgoing batch without sending it', async () => {
    const harness = makeHarness();
    await harness.peer.broadcast(
      [] as unknown as readonly [EntityType<Todo>, ...EntityType<Todo>[]],
    );
    expect(harness.sent).toEqual([]);
    expect(harness.events).toContainEqual(
      expect.objectContaining({ _tag: 'PeerSyncFailed', phase: 'send' }),
    );
    await harness.peer.close();
  });

  it('delivers inbound entities in order without overlap', async () => {
    const order: string[] = [];
    let releaseFirst: () => void = () => undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let active = 0;
    let maximumActive = 0;
    const harness = makeHarness({
      apply: (entities) =>
        Effect.promise(async () => {
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          if (entities[0]?.value.id === '1') await firstGate;
          order.push(entities[0]?.value.id ?? 'missing');
          active -= 1;
        }),
    });
    await waitForSubscription(harness);
    harness.deliver({ version: 1, entities: [entity('1')] });
    harness.deliver({ version: 1, entities: [entity('2')] });
    await vi.waitFor(() => expect(active).toBe(1));
    expect(order).toEqual([]);
    releaseFirst();
    await vi.waitFor(() => expect(order).toEqual(['1', '2']));
    expect(maximumActive).toBe(1);
    await harness.peer.close();
  });

  it('stops admission and drains admitted delivery before closing', async () => {
    const applied: string[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const harness = makeHarness({
      apply: (entities) =>
        Effect.promise(async () => {
          if (entities[0]?.value.id === '1') await gate;
          applied.push(entities[0]?.value.id ?? 'missing');
        }),
    });
    await waitForSubscription(harness);
    harness.deliver({ version: 1, entities: [entity('1')] });
    harness.deliver({ version: 1, entities: [entity('2')] });
    const closing = harness.peer.close();
    harness.deliver({ version: 1, entities: [entity('3')] });
    let closed = false;
    void closing.then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    release();
    await closing;
    expect(applied).toEqual(['1', '2']);
  });

  it('degrades safely when BroadcastChannel is unavailable', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const events: SyncEvent[] = [];
    const peer = makePeerSync<Todo>({
      collectionName: 'acme.todo',
      schema,
      runner: makeEffectRunner(undefined),
      report: (event) => Effect.sync(() => events.push(event)),
      apply: () => Effect.void,
    });
    await peer.broadcast([entity('1')]);
    await peer.close();
    expect(events).toEqual([]);
    vi.unstubAllGlobals();
  });

  it.each([
    [
      'channel-creation',
      (() => {
        throw new Error('creation failed');
      }) as PeerChannelFactory,
    ],
    [
      'subscription',
      (() => ({
        broadcast: async () => undefined,
        subscribe: async () => {
          throw new Error('subscription failed');
        },
      })) as PeerChannelFactory,
    ],
  ] as const)('reports non-fatal %s failures', async (phase, factory) => {
    const harness = makeHarness({ factory });
    await harness.peer.broadcast([entity('1')]);
    expect(harness.events).toContainEqual(
      expect.objectContaining({ _tag: 'PeerSyncFailed', phase }),
    );
    await harness.peer.close();
  });

  it('reports non-fatal broadcast, receive, and cleanup failures', async () => {
    const subscription: { receive?: (message: unknown) => void } = {};
    const factory: PeerChannelFactory = () => ({
      broadcast: () => Effect.fail('send failed'),
      subscribe: async (handler) => {
        subscription.receive = handler;
        return async () => {
          throw new Error('cleanup failed');
        };
      },
    });
    const harness = makeHarness({
      factory,
      apply: () => Effect.fail('application failed'),
    });
    await harness.peer.broadcast([entity('1')]);
    subscription.receive?.({ version: 1, entities: [entity('1')] });
    await vi.waitFor(() =>
      expect(harness.events).toContainEqual(
        expect.objectContaining({ _tag: 'PeerSyncFailed', phase: 'receive' }),
      ),
    );
    await expect(harness.peer.close()).resolves.toBeUndefined();
    expect(harness.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ phase: 'send' }),
        expect.objectContaining({ phase: 'receive' }),
        expect.objectContaining({ phase: 'cleanup' }),
      ]),
    );
  });
});
