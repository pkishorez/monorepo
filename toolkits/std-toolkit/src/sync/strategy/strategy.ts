import { make } from './definition.js';
import { newToOld } from './new-to-old.js';
import { oldToNew } from './old-to-new.js';

/** Build a Sync Strategy, or use one of the two built-ins. */
export const strategy = { make, oldToNew, newToOld };
