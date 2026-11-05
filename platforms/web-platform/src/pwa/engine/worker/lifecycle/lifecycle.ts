import * as Effect from 'effect/Effect';
import {
  isRuntimeCacheName,
  runtimeCacheName,
} from '../../contract/build/index.js';
import type {
  WorkerBuildInfo,
  WorkerConfig,
} from '../../contract/config/index.js';
import { attempt, deleteCaches, GlobalScope } from '../global-scope/index.js';
import {
  deleteOtherPrecaches,
  installPrecache,
  installShell,
} from '../precache/index.js';

/**
 * Saves the Precache: the build's assets, then Kabuki Start's App Shell. The
 * first install (no older version active) then skips waiting so the first
 * visit is controlled; later versions wait for SKIP_WAITING from the Update
 * Prompt.
 */
export const onInstall = (
  info: WorkerBuildInfo,
): Effect.Effect<void, Error, GlobalScope> =>
  Effect.gen(function* () {
    const scope = yield* GlobalScope;
    const firstInstall = !scope.hasActiveWorker();
    yield* installPrecache(info);
    yield* installShell(info.buildId);
    if (firstInstall) yield* attempt(() => scope.skipWaiting());
  });

/**
 * Deletes other builds' Precaches and Runtime Caches no rule uses any more,
 * then takes control of every open page.
 */
export const onActivate = (
  info: WorkerBuildInfo,
): Effect.Effect<void, Error, GlobalScope> =>
  Effect.gen(function* () {
    const scope = yield* GlobalScope;
    const kept = keptRuntimeCaches(info.config);
    yield* deleteOtherPrecaches(info.buildId);
    yield* deleteCaches((name) => isRuntimeCacheName(name) && !kept.has(name));
    yield* attempt(() => scope.claimClients());
  });

const keptRuntimeCaches = (config: WorkerConfig): ReadonlySet<string> =>
  new Set(config.strategies.map((rule) => runtimeCacheName(rule.cacheName)));
