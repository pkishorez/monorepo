import type { StdSync } from './types.js';
import { CollectionTracker } from './internal/shared.js';
import { buildTotalSync } from './internal/total-sync.js';
import { buildOnDemand } from './internal/on-demand.js';
import { buildSingleItem } from './internal/single-item.js';
import { buildRegistry } from './internal/registry.js';

export function createStdSync(): StdSync {
  const tracker = new CollectionTracker();

  return {
    totalSync: (opts) => buildTotalSync(tracker, opts),
    onDemand: (opts) => buildOnDemand(tracker, opts),
    singleItem: (opts) => buildSingleItem(tracker, opts),
    registry: () => buildRegistry(tracker),
  };
}
