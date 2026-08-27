import type { EncodedKey } from '../contract/index.js';
import { encodeCompositeKey } from './composite-key.js';

/**
 * The entity marker for the table-level enforcement baseline, held in
 * `meta._e` of its reserved item. No real registered entity can produce this
 * name (entity-derived pk components are always prefixed by the entity's own
 * name, never this reserved one), so scans can filter on it unambiguously.
 */
export const ENFORCEMENT_ENTITY = '__std_toolkit_enforcement__';

/** The fixed, reserved key the enforcement baseline is always stored at. */
export const ENFORCEMENT_KEY: EncodedKey = {
  pk: encodeCompositeKey([ENFORCEMENT_ENTITY]),
  sk: encodeCompositeKey(['snapshot']),
};
