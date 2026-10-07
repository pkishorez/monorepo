import {
  createCollection,
  type Collection,
  type NonSingleResult,
} from '@tanstack/react-db';
import { Duration, Effect, Exit, Scope, Stream } from 'effect';
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
import { closedTopic, type SyncStore } from '../store/contract/index.js';
import {
  makeEffectRunner,
  type EffectRuntime,
} from '../store/effect-runner/index.js';
import { Sync } from '../store/memory/index.js';
import { makeStoreRuntime } from '../store/store-runtime/index.js';

export type StdSyncConfig<R = never> = {
  name: string;
  /** Where the Std Sync is kept. Default: `Sync.memory()`. */
  store?: SyncStore;
  runtime?: EffectRuntime<R>;
  onEvent?: SyncReporter<R>;
  /** TanStack DB options every Collection starts from. */
  options?: StdCollectionOptions<object>;
  /** How long disposing waits for writes still on their way to the
   * Backend. Default: 5 seconds. */
  drain?: Duration.Input;
};

// A collection nobody watches is garbage-collected after this long.
const DEFAULT_GC_TIME = 10_000;

// How long disposing waits for writes in flight, unless configured.
const DEFAULT_DRAIN = Duration.seconds(5);

const makeStdSync = <R>(config: StdSyncConfig<R>) => {
  const name = stdSyncName(config.name);
  const kept = config.store ?? Sync.memory();
  const runner = makeEffectRunner(config.runtime);
  const report: SyncReporter<R> =
    config.onEvent ?? ((event) => Effect.logError(event));
  const store = makeStoreRuntime(kept.table(name));
  const names = new Set<CollectionName>();
  const cleanups = new Set<() => Promise<void>>();
  const writes = new Set<Promise<void>>();
  const drain = Duration.toMillis(
    Duration.fromInputUnsafe(config.drain ?? DEFAULT_DRAIN),
  );
  let disposed: Promise<void> | null = null;
  // Set once writes in flight have drained; until then they may still land.
  let stopped = false;

  const assertActive = (): void => {
    if (stopped) throw new Error(`[sync] "${name}" is disposed`);
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

  const trackWrite = (write: Promise<void>): Promise<void> => {
    writes.add(write);
    const settled = () => void writes.delete(write);
    write.then(settled, settled);
    return write;
  };

  // Writes in flight get until `drain` to reach the Backend; whatever has
  // not by then is stopped with everything else.
  const drainWrites = async () => {
    if (writes.size === 0) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.allSettled(writes),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, drain);
      }),
    ]);
    clearTimeout(timer);
  };

  const dispose = (): Promise<void> => {
    disposed ??= (async () => {
      await drainWrites();
      stopped = true;
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
      kept.doorbell
        .listen(closedTopic(name))
        .pipe(
          Stream.take(1),
          Stream.runDrain,
          Effect.andThen(
            runner.provide(report({ _tag: 'StoreClosed', sync: name })),
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
    if (disposed) throw new Error(`[sync] "${name}" is disposed`);
    const qualified = collectionName(name, schema.name);
    if (names.has(qualified))
      throw new Error(`[sync] collection "${qualified}" is already registered`);
    names.add(qualified);
    const built = buildCollection({
      schema,
      config: collectionConfig,
      name: qualified,
      store,
      shared: kept,
      runner,
      report,
      assertActive,
      trackCleanup,
      trackWrite,
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
