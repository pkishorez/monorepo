import type { BaseStrategy, Transaction } from '@tanstack/react-db';

/** Options for the coalesce pace strategy. */
export interface CoalesceStrategyOptions {
  /**
   * Optional cooldown gap in milliseconds, measured from the in-flight request's
   * completion before the coalesced backlog fires. Defaults to `0` (fire the
   * instant the in-flight request resolves). Never delays the leading-edge first
   * call.
   */
  wait?: number;
}

/**
 * Single-flight pace strategy with trailing coalescence.
 *
 * The first call fires immediately (leading edge). While that request is in
 * flight, every further call is coalesced into a single pending backlog. On the
 * in-flight request's success the merged backlog fires as one request, after an
 * optional `wait` cooldown gap. On failure the in-flight gate clears and the
 * backlog is retained — the next call fires it leading-edge. The strategy itself
 * never retries or backs off.
 *
 * Paced by request completion, not by a clock — unlike `debounceStrategy` /
 * `throttleStrategy`. Conforms to TanStack DB's `BaseStrategy`, so it drops into
 * any `createPacedMutations`.
 */
export const coalesceStrategy = (
  options?: CoalesceStrategyOptions,
): BaseStrategy<'coalesce'> => {
  const wait = options?.wait ?? 0;

  let inFlight = false;
  let hasPending = false;
  let pendingFn: (() => Transaction) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flushPending = (): void => {
    const fn = pendingFn!;
    hasPending = false;
    pendingFn = null;
    fire(fn);
  };

  const settle = (success: boolean): void => {
    inFlight = false;
    if (!success) {
      // Retain the backlog: the next call fires it leading-edge.
      hasPending = false;
      pendingFn = null;
      return;
    }
    if (!hasPending) return;
    if (wait > 0) {
      timer = setTimeout(() => {
        timer = null;
        flushPending();
      }, wait);
    } else {
      flushPending();
    }
  };

  const fire = (fn: () => Transaction): void => {
    inFlight = true;
    const tx = fn();
    tx.isPersisted.promise.then(
      () => settle(true),
      () => settle(false),
    );
  };

  return {
    _type: 'coalesce',
    execute: (fn) => {
      if (inFlight || timer !== null) {
        hasPending = true;
        pendingFn = fn as () => Transaction;
        return;
      }
      fire(fn as () => Transaction);
    },
    cleanup: () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      inFlight = false;
      hasPending = false;
      pendingFn = null;
    },
  };
};
