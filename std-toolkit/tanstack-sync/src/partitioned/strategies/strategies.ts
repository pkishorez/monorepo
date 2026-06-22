import { oldToNew } from './old-to-new/index.js';
import { newToOld } from './new-to-old/index.js';
import { bidirectional } from './bidirectional/index.js';

/**
 * The partitioned strategy kit.
 */
export const syncStrategy = { oldToNew, newToOld, bidirectional };
