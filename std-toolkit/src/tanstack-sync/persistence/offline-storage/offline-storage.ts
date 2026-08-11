import type {
  OfflineStorage as OfflineStorageValue,
  OfflineStorageGroup as OfflineStorageGroupValue,
  OfflineStorageSetting as OfflineStorageSettingValue,
} from './types.js';
import {
  resolveCollectionOfflineStorage as resolveCollection,
  resolveRootOfflineStorage as resolveRoot,
} from './resolve-offline-storage.js';
import {
  offlineStorageError as makeOfflineStorageError,
  type OfflineStorageError as OfflineStorageErrorValue,
} from './offline-storage-error.js';

export type OfflineStorage = OfflineStorageValue;
export type OfflineStorageGroup = OfflineStorageGroupValue;
export type OfflineStorageSetting = OfflineStorageSettingValue;
export type OfflineStorageError = OfflineStorageErrorValue;

export const offlineStorageError = makeOfflineStorageError;

export const offlineStorageGroupName = {
  sourceOfTruth: (schemaName: string): string => `sot/${schemaName}`,
  syncState: (schemaName: string): string => `state/${schemaName}`,
};

export const resolveRootOfflineStorage = resolveRoot;
export const resolveCollectionOfflineStorage = resolveCollection;
