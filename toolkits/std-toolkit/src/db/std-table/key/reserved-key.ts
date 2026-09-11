import type { EncodedKey } from '../contract/index.js';
import { encodeCompositeKey } from './composite-key.js';

/**
 * The entity marker for the table state record, held in `meta._e` of its
 * reserved item. No real registered entity can produce this name
 * (entity-derived pk components are always prefixed by the entity's own name,
 * never this reserved one), so scans can filter on it unambiguously. The value
 * predates the record's widening from a bare enforcement baseline, and stays
 * as it is so tables that already hold one keep reading it.
 */
export const TABLE_STATE_ENTITY = '__std_toolkit_enforcement__';

/** The fixed, reserved key the table state record is always stored at. */
export const TABLE_STATE_KEY: EncodedKey = {
  pk: encodeCompositeKey([TABLE_STATE_ENTITY]),
  sk: encodeCompositeKey(['snapshot']),
};
