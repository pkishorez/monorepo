import { makeTraceRecorder } from '@pkishorez/effect-tracer/recorder';
import { Effect } from 'effect';
import { StoryContext } from 'laymos/story';
import { nextUlid } from 'std-toolkit/core';
import { Memory } from 'std-toolkit/db/memory';
import { syncStore, type EffectRuntime } from 'std-toolkit/sync';
import { inMemoryLeadership } from 'std-toolkit/sync/leadership/in-memory';

import { makeSimulatedBrowserPlatform } from '../simulated-browser.js';
import { makeBackend } from './backend.js';
import { makeBrowser } from './browser.js';
import {
  MAIN_TAB,
  type AnyDefinition,
  type AnyEntity,
  type CollectionDefinition,
  type Device,
  type SimulationConfig,
  type SimulationLeadershipConfig,
  type SimulationScript,
  type SimulationWorld,
  type Tab,
} from './types.js';

// Public simulation DSL

export const Simulation = {
  collection<const E extends AnyEntity>(
    definition: CollectionDefinition<E>,
  ): CollectionDefinition<E> {
    return definition;
  },

  make<const D extends readonly AnyDefinition[]>(config: SimulationConfig<D>) {
    return {
      run<A, E>(script: SimulationScript<D, A, E>) {
        return runSimulation(config, script);
      },
    };
  },

  inMemory(): SimulationLeadershipConfig {
    return { _tag: 'InMemory' };
  },

  webLocks(
    options: {
      readonly releaseWhen?: 'hidden' | 'frozen';
    } = {},
  ): SimulationLeadershipConfig {
    return {
      _tag: 'WebLocks',
      releaseWhen: options.releaseWhen ?? 'hidden',
    };
  },
};

const runSimulation = <const D extends readonly AnyDefinition[], A, E>(
  config: SimulationConfig<D>,
  script: SimulationScript<D, A, E>,
): Effect.Effect<A, unknown, StoryContext> =>
  Effect.gen(function* () {
    const context = yield* StoryContext;
    const recorder = makeTraceRecorder();
    const runtime = {
      runSync: <X, XE>(effect: Effect.Effect<X, XE, never>) =>
        Effect.runSync(recorder.instrument(effect)),
      runPromise: <X, XE>(effect: Effect.Effect<X, XE, never>) =>
        Effect.runPromise(recorder.instrument(effect)),
    } satisfies EffectRuntime<never>;
    const flowId = `sync-story::${runtime.runSync(nextUlid)}`;
    const memory = Memory.make(config.table as never);
    const liveQueries = new Set<() => Promise<void>>();
    const collectionNames = new Set<string>();
    for (const selected of config.collections) {
      if (selected.entity.table.logicalName !== config.table.logicalName) {
        throw new Error(
          `Collection "${selected.entity.name}" does not belong to Backend table "${config.table.logicalName}"`,
        );
      }
      if (collectionNames.has(selected.entity.name)) {
        throw new Error(
          `Collection "${selected.entity.name}" is defined more than once`,
        );
      }
      collectionNames.add(selected.entity.name);
    }
    const backend = makeBackend({
      definitions: config.collections,
      table: config.table,
      layer: memory.layer,
      flowId,
    });
    const inMemoryLayer =
      config.leadership?._tag === 'InMemory' ? inMemoryLeadership() : undefined;
    const browserPlatform =
      config.leadership?._tag === 'WebLocks'
        ? makeSimulatedBrowserPlatform({
            releaseWhen: config.leadership.releaseWhen,
          })
        : undefined;
    const devices = new Map<string, Device<D>>();
    const openDevice = (name: string): Device<D> => {
      const existing = devices.get(name);
      if (existing) return existing;
      const created: Device<D> = {
        connection: {
          browser: name,
          online: true,
          disconnectListeners: new Set(),
        },
        tabs: new Map(),
      };
      devices.set(name, created);
      return created;
    };
    const openTab = (name: string, tabName: string): Tab<D> => {
      const device = openDevice(name);
      const existing = device.tabs.get(tabName);
      if (existing) return existing;
      const label = tabName === MAIN_TAB ? name : `${name}#${tabName}`;
      const simulated = browserPlatform?.openTab(label);
      let created!: Tab<D>;
      created = makeBrowser({
        name,
        syncName: flowId,
        label,
        definitions: config.collections,
        backend,
        flowId,
        runtime,
        disposeLiveQueries: liveQueries,
        connection: device.connection,
        storeLayer: Memory.make(syncStore).layer,
        ...(simulated
          ? {
              leadershipLayer: simulated.leadershipLayer,
              document: simulated.document,
            }
          : inMemoryLayer
            ? { leadershipLayer: inMemoryLayer }
            : {}),
        onClose: () => {
          if (device.tabs.get(tabName) === created) {
            device.tabs.delete(tabName);
          }
        },
      });
      device.tabs.set(tabName, created);
      return created;
    };
    const world: SimulationWorld<D> = {
      backend,
      browser(name) {
        const main = openTab(name, MAIN_TAB);
        return Object.assign(main, {
          tab: (tabName: string) => openTab(name, tabName),
        });
      },
      concurrent: (...effects) =>
        Effect.all(effects, { concurrency: 'unbounded' }) as never,
    };

    return yield* recorder.instrument(script(world)).pipe(
      Effect.ensuring(
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Promise.allSettled([...liveQueries].map((dispose) => dispose())),
          );
          yield* Effect.promise(() =>
            Promise.allSettled(
              [...devices.values()].flatMap((device) =>
                [...device.tabs.values()].map((tab) => tab.app.dispose()),
              ),
            ),
          );
          for (const flow of recorder.snapshotFlows()) {
            yield* context.beginSection({ kind: 'flow', flow });
          }
        }),
      ),
    );
  });
