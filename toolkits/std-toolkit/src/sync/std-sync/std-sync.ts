import {
  createCollection,
  type Collection,
  type NonSingleResult,
} from '@tanstack/react-db';
import { Effect, Exit, Scope, Stream } from 'effect';
import type { AnyEntityESchema } from '../../eschema/index.js';
import { buildCollection, type CollectionConfig } from '../collection/index.js';
import type {
  CollectionItem,
  StdCollectionOptions,
} from '../domain/collection-item/index.js';
import {
  collectionName,
  stdSyncName,
  type CollectionName,
} from '../domain/identity/index.js';
import type { SyncReporter } from '../domain/sync-event/index.js';
import {
  closedTopic,
  type StdSyncPlatform,
} from '../platform/contract/index.js';
import {
  makeEffectRunner,
  type EffectRuntime,
} from '../platform/effect-runner/index.js';
import { memory } from '../platform/memory/index.js';
import { makeSyncStore } from '../platform/sync-store/index.js';

export type StdSyncConfig<R = never> = {
  name: string;
  /** Default: `memory()`. */
  platform?: StdSyncPlatform;
  runtime?: EffectRuntime<R>;
  onEvent?: SyncReporter<R>;
  /** TanStack DB options every Collection starts from. */
  options?: StdCollectionOptions<object>;
};

// A collection nobody watches is garbage-collected after this long.
const DEFAULT_GC_TIME = 10_000;

const makeStdSync = <R>(config: StdSyncConfig<R>) => {
  const name = stdSyncName(config.name);
  const platform = config.platform ?? memory();
  const runner = makeEffectRunner(config.runtime);
  const report: SyncReporter<R> =
    config.onEvent ?? ((event) => Effect.logError(event));
  const store = makeSyncStore(platform.store(name));
  const names = new Set<CollectionName>();
  const cleanups = new Set<() => Promise<void>>();
  let disposed: Promise<void> | null = null;

  const assertActive = (): void => {
    if (disposed) throw new Error(`[sync] "${name}" is disposed`);
  };

  const trackCleanup = (cleanup: () => Promise<void>) => {
    let running: Promise<void> | null = null;
    const tracked = (): Promise<void> => {
      running ??= cleanup().finally(() => cleanups.delete(tracked));
      return running;
    };
    cleanups.add(tracked);
    return tracked;
  };

  const dispose = (): Promise<void> => {
    disposed ??= (async () => {
      const results = await Promise.allSettled(
        [...cleanups].map((cleanup) => cleanup()),
      );
      await store.dispose();
      const failures = results.flatMap((result) =>
        result.status === 'rejected' ? [result.reason] : [],
      );
      if (failures.length > 0)
        throw new AggregateError(failures, `[sync] "${name}" failed to stop`);
    })();
    return disposed;
  };

  // Another tab (or this one) deleted this Std Sync's storage: stop.
  const listening = runner.runSync(Scope.make());
  runner.runSync(
    Effect.forkIn(
      platform.doorbell
        .listen(closedTopic(name))
        .pipe(
          Stream.take(1),
          Stream.runDrain,
          Effect.andThen(
            runner.provide(report({ _tag: 'PlatformClosed', sync: name })),
          ),
          Effect.andThen(Effect.sync(() => void dispose())),
        ),
      listening,
    ),
  );
  trackCleanup(() => runner.runPromise(Scope.close(listening, Exit.void)));

  // The schema comes first so TypeScript knows the row type before it reads
  // the strategies, and can type their callbacks.
  const collection = <S extends AnyEntityESchema>(
    schema: S,
    collectionConfig: CollectionConfig<S, R> = {},
  ): SyncedCollection<S['Type']> => {
    assertActive();
    const qualified = collectionName(name, schema.name);
    if (names.has(qualified))
      throw new Error(`[sync] collection "${qualified}" is already registered`);
    names.add(qualified);
    const built = buildCollection({
      schema,
      config: collectionConfig,
      name: qualified,
      store,
      platform,
      runner,
      report,
      assertActive,
      trackCleanup,
    });
    return createCollection({
      gcTime: DEFAULT_GC_TIME,
      ...config.options,
      ...collectionConfig.options,
      ...built,
    } as never) as unknown as SyncedCollection<S['Type']>;
  };

  return { name: name as string, collection, dispose };
};

type CreateStdSync = {
  <R>(
    config: StdSyncConfig<R> & { runtime: EffectRuntime<R> },
  ): ReturnType<typeof makeStdSync<R>>;
  (
    config: StdSyncConfig<never> & { runtime?: never },
  ): ReturnType<typeof makeStdSync<never>>;
};

export const createStdSync = makeStdSync as CreateStdSync;

/** Public read surface of a Std Sync Collection. */
export type SyncedCollection<T extends object> = Collection<
  CollectionItem<T>,
  string
> &
  NonSingleResult;
