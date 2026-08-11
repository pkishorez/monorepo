import { Schema } from 'effect';
import { MetaSchema, type EntityType } from '../../../core/index.js';

const isMeta = Schema.is(MetaSchema);

export const isEntity = (value: unknown): value is EntityType<unknown> => {
  if (value == null || typeof value !== 'object') return false;
  const candidate = value as { value?: unknown; meta?: unknown };
  return (
    'value' in candidate && candidate.value != null && isMeta(candidate.meta)
  );
};
