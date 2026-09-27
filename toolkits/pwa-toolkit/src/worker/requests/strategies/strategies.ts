import type * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import {
  isRuntimeCacheName,
  runtimeCacheName,
} from '../../../shared/build/index.js';
import type { WorkerConfig } from '../../../shared/config/index.js';
import { findStrategyRule } from '../../../shared/strategy/index.js';
import {
  deleteCaches,
  type GlobalScope,
  type KeepAlive,
} from '../../global-scope/index.js';
import { cacheStore } from './cache-store.js';
import { strategies } from './kinds.js';

/**
 * A response from the first matching Runtime Cache rule, or none when no
 * rule applies (the request then goes to the network untouched).
 */
export const handleRuntimeCache = (
  config: WorkerConfig,
  request: Request,
  origin: string,
): Option.Option<Effect.Effect<Response, Error, GlobalScope | KeepAlive>> =>
  Option.map(findStrategyRule(config.strategies, request, origin), (rule) =>
    strategies[rule.strategy](
      request,
      cacheStore({
        name: runtimeCacheName(rule.cacheName),
        maxEntries: rule.maxEntries,
        maxAgeSeconds: rule.maxAgeSeconds,
      }),
      rule.networkTimeoutMs,
    ),
  );

/** Deletes every Runtime Cache, e.g. on sign-out. */
export const clearRuntimeCaches: Effect.Effect<void, Error, GlobalScope> =
  deleteCaches(isRuntimeCacheName);
