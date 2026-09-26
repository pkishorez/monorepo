import type { Entity } from '../../../core/index.js';

/**
 * Convergence rule: accept an incoming entity iff there is no current entity or
 * the incoming update key is lexicographically greater. A stale incoming is a
 * successful no-op (skip).
 */
export const converge = <TItem>(
  current: Entity<TItem> | null,
  incoming: Entity<TItem>,
): 'accept' | 'skip' =>
  current == null || incoming.meta._u > current.meta._u ? 'accept' : 'skip';
