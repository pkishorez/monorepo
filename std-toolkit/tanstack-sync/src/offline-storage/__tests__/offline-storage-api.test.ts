import { describe, expect, it } from 'vitest';
import {
  offlineStorageGroupName,
  resolveCollectionOfflineStorage,
  resolveRootOfflineStorage,
} from '../index.js';
import { memoryOfflineStorage } from '../memory-offline-storage.js';

describe('offline storage API', () => {
  it('builds deterministic group names', () => {
    expect(offlineStorageGroupName.sourceOfTruth('User')).toBe('sot/User');
    expect(offlineStorageGroupName.syncState('User')).toBe('state/User');
  });

  it('resolves root defaults and collection overrides', () => {
    const inherited = memoryOfflineStorage();
    const override = memoryOfflineStorage();

    expect(resolveRootOfflineStorage(inherited)).toBe(inherited);
    expect(resolveCollectionOfflineStorage({ inherited })).toBe(inherited);
    expect(resolveCollectionOfflineStorage({ inherited, override })).toBe(
      override,
    );
    expect(resolveRootOfflineStorage(false)).not.toBe(inherited);
    expect(
      resolveCollectionOfflineStorage({ inherited, override: false }),
    ).not.toBe(inherited);
  });
});
