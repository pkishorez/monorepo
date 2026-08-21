import { makeTraceRecorder } from '@pkishorez/effect-tracer/recorder';
import { Effect, Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { EntityESchema } from '../../../../eschema/index.js';
import { noStrategyState } from '../../../domain/strategy-state/index.js';
import { createStdSync } from '../../../sync.js';
import type { EffectRuntime } from '../../../runtime/effect-runner/index.js';
import type { DecodedEntity } from '../../../../core/index.js';
import {
  contractLayer,
  type StdTableContract,
} from '../../../../db/std-table/contract/index.js';
import { syncStore } from '../../../persistence/sync-store/index.js';

const schema = EntityESchema.make('Comment', 'id', {
  postId: Schema.String,
  body: Schema.String,
}).build();

const subset = {
  where: {
    type: 'func' as const,
    name: 'eq' as const,
    args: [
      { type: 'ref' as const, path: ['comments', 'postId'] },
      { type: 'val' as const, value: 'post-1' },
    ],
  },
};

describe('collection flow tracing', () => {
  it('cancels Sync Replica hydration during cleanup', async () => {
    const never = () => Effect.never;
    const contract: StdTableContract = {
      getItem: never,
      queryItems: never,
      writeItem: never,
      transactWriteItems: never,
      hardDeleteItem: never,
      hardDeleteEntityItems: never,
      hardDeleteAllItems: never,
    };
    const strategyRuns: string[] = [];
    const built = createStdSync({
      name: 'comments',
      platform: {
        storeLayer: contractLayer(syncStore.logicalName, contract),
      },
    }).sync({
      schema,
      sync: {
        total: {
          strategy: {
            name: 'global-worker',
            state: noStrategyState(),
            run: () =>
              Effect.sync(() => strategyRuns.push('started')).pipe(
                Effect.andThen(Effect.never),
              ),
          },
        },
      },
    });
    const probe = { readyCount: 0, writeCount: 0 };
    const mounted = built.sync.sync({
      begin: () => undefined,
      write: () => {
        probe.writeCount += 1;
      },
      commit: () => undefined,
      truncate: () => undefined,
      markReady: () => {
        probe.readyCount += 1;
      },
      collection: {
        update: () => undefined,
        on: () => () => undefined,
        subscriberCount: 0,
        values: () => [][Symbol.iterator](),
      },
    } as never) as { cleanup: () => Promise<void> };

    await expect(mounted.cleanup()).resolves.toBeUndefined();
    expect(probe).toEqual({ readyCount: 0, writeCount: 0 });
    expect(strategyRuns).toEqual([]);
  });

  it('records one collection flow with stable global and partition lanes', async () => {
    const recorder = makeTraceRecorder();
    const runtime = {
      runSync: <A, E>(effect: Effect.Effect<A, E, never>) =>
        Effect.runSync(recorder.instrument(effect)),
      runPromise: <A, E>(effect: Effect.Effect<A, E, never>) =>
        Effect.runPromise(recorder.instrument(effect)),
    } satisfies EffectRuntime<never>;
    const entity: DecodedEntity<typeof schema.Type> = {
      value: { id: 'comment-1', postId: 'post-1', body: 'Hello' },
      meta: { _e: 'Comment', _u: '1', _d: false },
    };
    const strategy = (name: string, writes = false) => ({
      name,
      state: noStrategyState(),
      run: (ctx: {
        flow: { log: (message: unknown) => Effect.Effect<void> };
        applyToSyncReplica: (
          entities: DecodedEntity<typeof schema.Type>[],
        ) => Effect.Effect<void, unknown>;
      }) =>
        ctx.flow
          .log('Custom strategy working')
          .pipe(
            Effect.andThen(
              writes
                ? ctx
                    .applyToSyncReplica([entity])
                    .pipe(Effect.andThen(ctx.applyToSyncReplica([entity])))
                : Effect.void,
            ),
            Effect.andThen(Effect.never),
          ),
    });
    const built = createStdSync({
      name: 'comments',
      runtime,
      flow: {
        id: 'sync-story::test',
        participantPrefix: 'browser:alice',
      },
    }).sync({
      schema,
      sync: {
        total: { strategy: strategy('global-worker', true) },
        partitions: {
          postId: () => ({ strategy: strategy('partition-worker') }),
        },
      },
    });
    const probe = { readyCount: 0 };
    const mounted = built.sync.sync({
      begin: () => undefined,
      write: () => undefined,
      commit: () => undefined,
      truncate: () => undefined,
      markReady: () => {
        probe.readyCount += 1;
      },
      collection: {
        update: () => undefined,
        on: () => () => undefined,
        subscriberCount: 1,
        values: () => [][Symbol.iterator](),
      },
    } as never) as {
      cleanup: () => Promise<void>;
      loadSubset: (options: typeof subset) => true;
      unloadSubset: (options: typeof subset) => void;
    };

    await vi.waitFor(() => expect(probe.readyCount).toBe(1));
    mounted.loadSubset(subset);
    mounted.loadSubset(subset);
    await vi.waitFor(() =>
      expect(
        recorder
          .snapshotFlows()[0]
          ?.items.filter((item) => item.name === 'Custom strategy working'),
      ).toHaveLength(2),
    );
    await vi.waitFor(() =>
      expect(
        recorder
          .snapshot()
          .logs.filter((log) => log.message === 'Sync Replica write'),
      ).toHaveLength(2),
    );
    mounted.unloadSubset(subset);
    mounted.unloadSubset(subset);
    // Refcount is back to 0. Reactivating must reuse the same lane and open a
    // second Activation on it rather than minting a new participant.
    mounted.loadSubset(subset);
    await vi.waitFor(() =>
      expect(
        recorder
          .snapshotFlows()[0]
          ?.items.filter((item) => item.name === 'Custom strategy working'),
      ).toHaveLength(3),
    );
    mounted.unloadSubset(subset);
    await mounted.cleanup();

    const flows = recorder.snapshotFlows();
    expect(flows).toHaveLength(1);
    const flow = flows[0]!;
    expect(flow.id).toBe('sync-story::test');
    expect(flow.id).toBe(built.utils.flowId());
    expect(flow.warnings).toEqual([]);
    const partitionLanes = new Set(
      flow.activations
        .filter(({ name }) => name === 'Partition active')
        .map(({ participantName }) => participantName),
    );
    expect(
      flow.activations.map(({ name, outcome }) => [name, outcome]),
    ).toEqual([
      ['Collection lifecycle', 'completed'],
      ['Sync lifecycle', 'completed'],
      ['Partition active', 'completed'],
      ['Partition active', 'completed'],
    ]);
    // Two Activations, one lane.
    expect(partitionLanes.size).toBe(1);
    expect(flow.activations.every(({ endItemId }) => endItemId !== null)).toBe(
      true,
    );
    expect(
      recorder.snapshot().spans.every((span) => span.endTime !== null),
    ).toBe(true);
    const persistenceSpans = recorder
      .snapshot()
      .spans.filter((span) => span.name === 'sync.sync-store');
    expect(persistenceSpans).not.toHaveLength(0);
    expect(persistenceSpans).toContainEqual(
      expect.objectContaining({
        attributes: expect.objectContaining({
          'db.system.name': 'std-table',
          'db.namespace': 'sync-store',
          'db.operation.name': 'transact',
          'sync.collection': 'comments.comment',
          'sync.store.record': 'sync-replica',
        }),
      }),
    );
    const writeSpanIds = new Set(
      recorder
        .snapshot()
        .spans.filter((span) => span.name === 'sync.apply-to-sync-replica')
        .map((span) => span.spanId),
    );
    expect(
      persistenceSpans.some(
        (span) =>
          span.attributes['db.operation.name'] === 'transact' &&
          span.parentSpanId !== null &&
          writeSpanIds.has(span.parentSpanId),
      ),
    ).toBe(true);

    const participants = new Set(
      flow.items.map(({ participantName }) => participantName),
    );
    expect(participants).toEqual(
      new Set([
        'browser:alice/comments.comment',
        'browser:alice/comments.comment/{global}.global-worker',
        'browser:alice/comments.comment/{postid=post-1}.partition-worker',
      ]),
    );
    expect(
      flow.items.filter(
        (item) =>
          item.kind === 'message' && item.name === 'Partition subscribe',
      ),
    ).toHaveLength(3);
    const syncWrites = recorder
      .snapshot()
      .logs.filter((log) => log.message === 'Sync Replica write');
    expect(syncWrites).toHaveLength(2);
    expect(syncWrites.map((log) => log.annotations.storedCount).sort()).toEqual(
      [0, 1],
    );
    expect(syncWrites.map((log) => log.annotations.receivedCount)).toEqual([
      1, 1,
    ]);
    expect(
      new Set(
        flow.items
          .filter(
            (item) =>
              item.kind === 'activity' && item.name === 'Strategy attempt',
          )
          .map(({ participantName }) => participantName),
      ),
    ).toEqual(
      new Set([
        'browser:alice/comments.comment/{global}.global-worker',
        'browser:alice/comments.comment/{postid=post-1}.partition-worker',
      ]),
    );
  });

  it('keeps one active flow across repeated collection starts and cleanups', async () => {
    const recorder = makeTraceRecorder();
    const runtime = {
      runSync: <A, E>(effect: Effect.Effect<A, E, never>) =>
        Effect.runSync(recorder.instrument(effect)),
      runPromise: <A, E>(effect: Effect.Effect<A, E, never>) =>
        Effect.runPromise(recorder.instrument(effect)),
    } satisfies EffectRuntime<never>;
    const built = createStdSync({ name: 'comments', runtime }).sync({ schema });

    for (let lifecycle = 0; lifecycle < 2; lifecycle += 1) {
      const probe = { readyCount: 0 };
      const mounted = built.sync.sync({
        begin: () => undefined,
        write: () => undefined,
        commit: () => undefined,
        truncate: () => undefined,
        markReady: () => {
          probe.readyCount += 1;
        },
        collection: {
          update: () => undefined,
          on: () => () => undefined,
          subscriberCount: 0,
          values: () => [][Symbol.iterator](),
        },
      } as never) as { cleanup: () => Promise<void> };
      await vi.waitFor(() => expect(probe.readyCount).toBe(1));
      await mounted.cleanup();
    }

    const flows = recorder.snapshotFlows();
    expect(flows).toHaveLength(1);
    expect(flows[0]?.id).toMatch(
      /^comments\.comment::[0-7][0-9A-HJKMNP-TV-Z]{25}$/,
    );
    expect(
      flows[0]?.items.filter((item) => item.name === 'Collection start'),
    ).toHaveLength(2);
    expect(
      flows[0]?.items.filter((item) => item.name === 'Collection cleanup'),
    ).toHaveLength(2);
    // One stable lane, two Activations — the case the lane brightness exists for.
    expect(flows[0]?.activations).toMatchObject([
      { participantName: 'comments.comment', outcome: 'completed' },
      { participantName: 'comments.comment', outcome: 'completed' },
    ]);
    expect(flows[0]?.warnings).toEqual([]);
  });
});
