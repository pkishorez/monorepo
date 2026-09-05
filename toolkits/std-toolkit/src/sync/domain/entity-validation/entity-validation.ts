import { Schema } from 'effect';
import { EntityMetaSchema, type DecodedEntity } from '../../../core/index.js';

const isMeta = Schema.is(EntityMetaSchema);

export const isDecodedEntity = (
  value: unknown,
): value is DecodedEntity<unknown> => {
  if (value == null || typeof value !== 'object') return false;
  const candidate = value as { value?: unknown; meta?: unknown };
  return (
    'value' in candidate &&
    candidate.value != null &&
    candidate.meta != null &&
    typeof candidate.meta === 'object' &&
    !Object.hasOwn(candidate.meta, '_v') &&
    isMeta(candidate.meta)
  );
};
