import type {
  BaseStrategy,
  DebounceStrategyOptions,
  QueueStrategyOptions,
  ThrottleStrategyOptions,
} from '@tanstack/react-db';
import {
  debounceStrategy,
  queueStrategy,
  throttleStrategy,
} from '@tanstack/react-db';
import type { CoalesceStrategyOptions } from './coalesce-strategy.js';
import { coalesceStrategy } from './coalesce-strategy.js';

/** A thunk that produces a fresh pace-strategy instance per in-flight gate. */
export type PaceStrategyFactory = () => BaseStrategy;

/**
 * The pace-strategy kit selected via a collection's `updatePacing` field. Controls
 * *when* `pacedUpdate`'s optimistic mutations are committed to the server. Each entry
 * takes the strategy's options and returns a factory: the engine instantiates one
 * strategy per in-flight gate (per key for keyed `sync`, once for `singleItemSync`),
 * so gates never leak across keys. `coalesce` is std-sync's own single-flight pacer;
 * the rest re-expose TanStack DB's built-ins.
 */
export const paceStrategy = {
  coalesce:
    (options?: CoalesceStrategyOptions): PaceStrategyFactory =>
    () =>
      coalesceStrategy(options),
  debounce:
    (options: DebounceStrategyOptions): PaceStrategyFactory =>
    () =>
      debounceStrategy(options),
  throttle:
    (options: ThrottleStrategyOptions): PaceStrategyFactory =>
    () =>
      throttleStrategy(options),
  queue:
    (options?: QueueStrategyOptions): PaceStrategyFactory =>
    () =>
      queueStrategy(options),
};
