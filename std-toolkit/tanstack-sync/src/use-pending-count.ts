import { useSyncExternalStore } from 'react';

type PendingCountUtils = {
  pendingCount: (key: string) => number;
  subscribePending: (listener: () => void) => () => void;
};

/**
 * Reactively reads the number of update operations currently queued or in
 * flight for a single item key. The count rises as updates are submitted and
 * falls as their transactions settle, reaching zero when the row is fully
 * synced.
 *
 * @param collection - A collection whose `utils` expose `pendingCount` and
 * `subscribePending` (any `std-sync` collection).
 * @param key - The item key to observe.
 */
export const usePendingCount = (
  collection: { utils: PendingCountUtils },
  key: string,
): number =>
  useSyncExternalStore(
    (onChange) => collection.utils.subscribePending(onChange),
    () => collection.utils.pendingCount(key),
    () => 0,
  );
