import type { EntityType } from '../../core/index.js';

/**
 * Convergence rule: accept an incoming entity iff there is no current entity or
 * the incoming update key is lexicographically greater. A stale incoming is a
 * successful no-op (skip).
 */
export const converge = <TItem>(
  current: EntityType<TItem> | null,
  incoming: EntityType<TItem>,
): 'accept' | 'skip' =>
  current == null || incoming.meta._u > current.meta._u ? 'accept' : 'skip';
