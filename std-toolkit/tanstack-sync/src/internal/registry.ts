import { BroadcastSchema, EntityType } from '@std-toolkit/core';
import { Schema } from 'effect';
import type { CollectionRegistry } from '../types.js';
import type { CollectionTracker } from './shared.js';

export const buildRegistry = (
  tracker: CollectionTracker,
): CollectionRegistry => ({
  process: (message: unknown) => {
    if (!Schema.is(BroadcastSchema)(message)) return;

    for (const entry of message.values) {
      const target = tracker.getByName(entry.meta._e);
      target?.utils.upsert(entry as EntityType<any>);
    }
  },
});
