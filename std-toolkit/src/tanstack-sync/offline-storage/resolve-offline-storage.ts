import { memoryOfflineStorage } from './memory-offline-storage.js';
import type { OfflineStorage, OfflineStorageSetting } from './types.js';

export const resolveRootOfflineStorage = (
  setting?: OfflineStorageSetting,
): OfflineStorage =>
  setting === undefined || setting === false ? memoryOfflineStorage() : setting;

export const resolveCollectionOfflineStorage = (args: {
  inherited: OfflineStorage;
  override?: OfflineStorageSetting | undefined;
}): OfflineStorage =>
  args.override === undefined
    ? args.inherited
    : args.override === false
      ? memoryOfflineStorage()
      : args.override;
