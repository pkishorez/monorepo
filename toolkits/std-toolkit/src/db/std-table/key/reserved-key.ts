import type { EncodedKey } from '../contract/index.js';
import { encodeCompositeKey } from './composite-key.js';

/**
 * Where releases before the Alchemy snapshot guard kept their enforcement
 * baseline: one reserved item inside the table. No registered entity can
 * produce this key, so an adapter's setup may delete it unconditionally to
 * clean up a table deployed by an earlier release.
 */
export const LEGACY_BASELINE_KEY: EncodedKey = {
  pk: encodeCompositeKey(['__std_toolkit_enforcement__']),
  sk: encodeCompositeKey(['snapshot']),
};
