import type { EntityType } from '@std-toolkit/core';

/**
 * Sync-state shape for the `oldToNew` strategy: the newest entity yet drained,
 * used as the cursor for the next fetch.
 */
export type OldToNewState = { cursor: EntityType<unknown> | null };
