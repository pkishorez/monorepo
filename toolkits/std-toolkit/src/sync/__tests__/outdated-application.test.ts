import { Effect, Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { EntitySchema } from '../../core/index.js';
import { Memory } from '../../db/memory/index.js';
import { EntityESchema } from '../../eschema/index.js';
import { noStrategyState } from '../strategy/state/index.js';
import { createStdSync, syncStore } from '../std-sync/std-sync.js';
import type { SyncEvent } from '../domain/sync-event/index.js';

const Event = EntityESchema.make('Event', 'id', { at: Schema.String }).build();

describe('outdated application', () => {
  it('stops the session and reports OutdatedApplication once', async () => {
    const reported: SyncEvent[] = [];
    let attempts = 0;
    const std = createStdSync({
      name: 'outdated',
      onEvent: (event) => Effect.sync(() => void reported.push(event)),
    });
    const events = std.collection({
      schema: Event,
      sync: {
        total: {
          strategy: {
            name: 'newer-backend',
            state: noStrategyState(),
            run: () =>
              Effect.gen(function* () {
                attempts += 1;
                yield* EntitySchema(Event).decode({
                  value: { id: 'a', at: '2026-01-01T00:00:00.000Z' },
                  meta: { _e: 'Event', _v: 'v2', _u: '1', _d: false },
                });
              }),
          },
        },
      },
    });
    await events.preload();

    await vi.waitFor(() => expect(attempts).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(attempts).toBe(1);
    expect(
      reported.filter((event) => event._tag === 'OutdatedApplication'),
    ).toEqual([
      {
        _tag: 'OutdatedApplication',
        collection: 'outdated.event',
        version: 'v2',
        latestVersion: 'v1',
      },
    ]);
    expect(reported.some((event) => event._tag === 'StrategyFailed')).toBe(
      false,
    );

    await std.dispose();
  });

  it('ignores a newer entity from the Registry and reports it once', async () => {
    const reported: SyncEvent[] = [];
    const std = createStdSync({
      name: 'outdated-registry',
      onEvent: (event) => Effect.sync(() => void reported.push(event)),
    });
    const events = std.collection({ schema: Event });
    await events.preload();

    const newer = {
      value: { id: 'a', at: '2026-01-01T00:00:00.000Z' },
      meta: { _e: 'Event', _v: 'v2', _u: '1', _d: false },
    };
    std.registry().process({ values: [newer, newer], persist: true });

    await vi.waitFor(() =>
      expect(
        reported.filter((event) => event._tag === 'OutdatedApplication'),
      ).toHaveLength(1),
    );
    expect(events.get('a')).toBeUndefined();
    expect(
      reported.some((event) => event._tag === 'RegistryDeliveryFailed'),
    ).toBe(false);

    await std.dispose();
  });

  it('ignores a newer entity from a projection-only Registry delivery', async () => {
    const reported: SyncEvent[] = [];
    const std = createStdSync({
      name: 'outdated-projection',
      onEvent: (event) => Effect.sync(() => void reported.push(event)),
    });
    const events = std.collection({ schema: Event });
    await events.preload();

    std.registry().process({
      values: [
        {
          value: { id: 'a', at: '2026-01-01T00:00:00.000Z' },
          meta: { _e: 'Event', _v: 'v2', _u: '1', _d: false },
        },
      ],
      persist: false,
    });

    await vi.waitFor(() =>
      expect(
        reported.filter((event) => event._tag === 'OutdatedApplication'),
      ).toHaveLength(1),
    );
    expect(events.get('a')).toBeUndefined();

    await std.dispose();
  });

  it('stops cadence repair when a repair fetch finds a newer version', async () => {
    const reported: SyncEvent[] = [];
    let fetches = 0;
    const std = createStdSync({
      name: 'outdated-cadence',
      cadence: { window: 1_000, readiness: 0, pollDelay: 10 },
      onEvent: (event) => Effect.sync(() => void reported.push(event)),
    });
    const u = '2026-01-01T00:00:00.000Z';
    const events = std.collection({
      schema: Event,
      sync: {
        total: {
          strategy: {
            name: 'seed',
            state: noStrategyState(),
            run: (ctx) =>
              ctx.applyToSyncReplica([
                {
                  value: { id: 'a', at: u },
                  meta: {
                    _e: 'Event',
                    _v: 'v1',
                    _u: u,
                    _d: false,
                    _s: Date.parse(u) + 10,
                  },
                },
              ]),
          },
          repair: {
            fetchFrom: () =>
              Effect.gen(function* () {
                fetches += 1;
                const entity = yield* EntitySchema(Event).decode({
                  value: { id: 'b', at: u },
                  meta: { _e: 'Event', _v: 'v2', _u: u, _d: false },
                });
                return [entity];
              }),
          },
        },
      },
    });
    const subscription = events.subscribeChanges(() => {});
    await events.preload();

    await vi.waitFor(() =>
      expect(
        reported.filter((event) => event._tag === 'OutdatedApplication'),
      ).toHaveLength(1),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetches).toBe(1);
    expect(reported.some((event) => event._tag === 'CadenceFailed')).toBe(
      false,
    );

    subscription.unsubscribe();
    await std.dispose();
  });
});

describe('Sync State across a schema upgrade', () => {
  it('reads a cursor saved by an older version in the latest version', async () => {
    const v1 = EntityESchema.make('Task', 'id', {
      title: Schema.String,
    }).build();
    const v2 = EntityESchema.make('Task', 'id', { title: Schema.String })
      .evolve('v2', { title: null, label: Schema.String }, (value) => ({
        id: value.id,
        label: value.title,
      }))
      .build();
    const memory = Memory.make(syncStore);
    const seen: unknown[] = [];
    const mount = (schema: typeof v1 | typeof v2) => {
      const std = createStdSync({
        name: 'upgrade',
        platform: { storeLayer: memory.layer },
      });
      const tasks = std.collection({
        schema: schema as typeof v1,
        sync: {
          total: {
            strategy: {
              name: 'cursor',
              state: {
                schema: (entity) =>
                  Schema.Struct({ cursor: Schema.NullOr(entity) }),
                empty: { cursor: null },
              },
              run: (ctx) =>
                Effect.gen(function* () {
                  const { cursor } = yield* ctx.getState;
                  seen.push(cursor);
                  if (cursor === null)
                    yield* ctx.setState({
                      cursor: {
                        value: { id: 'a', title: 'first' },
                        meta: { _e: 'Task', _v: 'v1', _u: '1', _d: false },
                      },
                    });
                }),
            },
          },
        },
      });
      return { std, tasks };
    };

    const first = mount(v1);
    await first.tasks.preload();
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    await first.std.dispose();

    const second = mount(v2);
    await second.tasks.preload();
    await vi.waitFor(() => expect(seen).toHaveLength(2));
    expect(seen[1]).toEqual({
      value: { id: 'a', label: 'first' },
      meta: { _e: 'Task', _v: 'v2', _u: '1', _d: false },
    });
    await second.std.dispose();
  });
});
