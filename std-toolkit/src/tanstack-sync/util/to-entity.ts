import type { EntityType, SingleEntityType } from '../../core/index.js';

/**
 * Lifts a single entity into the engine's `EntityType` shape by marking
 * it live. A single-item record is never a tombstone.
 */
export const toEntity = <TItem>(
  entity: SingleEntityType<TItem>,
): EntityType<TItem> => ({
  value: entity.value,
  meta: { ...entity.meta, _d: false },
});
