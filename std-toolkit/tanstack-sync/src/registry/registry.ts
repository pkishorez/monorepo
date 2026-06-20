import { Effect } from 'effect';
import type { EntityType } from '@std-toolkit/core';
import type { Tracker } from './tracker.js';

/**
 * Builds the broadcast router over a tracker. `process` validates the message
 * shape (explicit `persist`), groups incoming entities by `meta._e`, looks up the
 * owning collection handle, and routes each group to `writeServerTruth` (persist)
 * or `projectOnly` (preview). Entities whose `_e` no collection owns are silently
 * ignored. The registry never touches strategy sync-state.
 */
export const buildRegistry = (tracker: Tracker) => ({
  process: (message: {
    values: EntityType<unknown>[];
    persist: boolean;
  }): void => {
    if (
      !message ||
      !Array.isArray(message.values) ||
      typeof message.persist !== 'boolean'
    ) {
      throw new Error(
        '[std-sync] registry.process requires { values: Entity[]; persist: boolean }.',
      );
    }

    const { values, persist } = message;
    const groups = new Map<string, EntityType<unknown>[]>();
    for (const entity of values) {
      const type = entity.meta._e;
      const group = groups.get(type) ?? [];
      group.push(entity);
      groups.set(type, group);
    }

    for (const [type, entities] of groups) {
      const handle = tracker.lookup(type);
      if (!handle) continue;
      const route = persist ? handle.writeServerTruth : handle.projectOnly;
      Effect.runFork(route(entities));
    }
  },
});
