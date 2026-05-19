import type { StdCollectionOptions, StdSync } from './types.js';
import { CollectionTracker } from './internal/shared.js';
import { buildTotalSync } from './internal/total-sync.js';
import { buildOnDemand } from './internal/on-demand.js';
import { buildSingleItem } from './internal/single-item.js';
import { buildRegistry } from './internal/registry.js';

export function createStdSync(defaults?: {
  options?: StdCollectionOptions;
}): StdSync {
  const tracker = new CollectionTracker();
  const defaultOptions = defaults?.options;

  const mergeOptions = (
    perCollection: StdCollectionOptions | undefined,
  ): StdCollectionOptions | undefined => {
    if (!defaultOptions) return perCollection;
    if (!perCollection) return defaultOptions;
    return { ...defaultOptions, ...perCollection };
  };

  const withDefaults = <T extends { options?: StdCollectionOptions }>(
    opts: T,
  ): T => {
    const merged = mergeOptions(opts.options);
    return merged ? { ...opts, options: merged } : opts;
  };

  return {
    totalSync: (opts) => buildTotalSync(tracker, withDefaults(opts)),
    onDemand: (opts) => buildOnDemand(tracker, withDefaults(opts)),
    singleItem: (opts) => buildSingleItem(tracker, withDefaults(opts)),
    registry: () => buildRegistry(tracker),
  };
}
