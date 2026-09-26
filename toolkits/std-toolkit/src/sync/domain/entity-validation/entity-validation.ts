import { Schema } from 'effect';
import { EntityMetaSchema, type Entity } from '../../../core/index.js';

const isMeta = Schema.is(EntityMetaSchema);

export const isEntity = (value: unknown): value is Entity<unknown> => {
  if (value == null || typeof value !== 'object') return false;
  const candidate = value as { value?: unknown; meta?: unknown };
  return (
    'value' in candidate &&
    candidate.value != null &&
    candidate.meta != null &&
    typeof candidate.meta === 'object' &&
    isMeta(candidate.meta)
  );
};
