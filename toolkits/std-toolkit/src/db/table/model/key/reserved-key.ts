/**
 * Entity names under this prefix belong to the toolkit: setup keeps the
 * Stored contract as rows named so (ADR 0021). A table refuses an entity
 * declared under one, and `scan` never returns them.
 */
export const RESERVED_ENTITY_PREFIX = '_std_';

export const isReservedEntity = (name: string): boolean =>
  name.startsWith(RESERVED_ENTITY_PREFIX);
