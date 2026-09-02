import type { Brand } from './brand.js';
import type { PartitionValue } from './partition-key.js';
import { normalizeName, stdSyncName } from './sync-name.js';

export type SyncAddress = string & Brand<'SyncAddress'>;

const label = (value: PartitionValue): string => {
  try {
    return normalizeName(String(value));
  } catch {
    return 'empty';
  }
};

export const syncAddress = (name: string): SyncAddress =>
  stdSyncName(name) as string as SyncAddress;

export const collectionSyncAddress = (
  syncName: string,
  schemaName: string,
): SyncAddress =>
  `${stdSyncName(syncName)}.${normalizeName(schemaName)}` as SyncAddress;

export const globalSyncAddress = (address: string): SyncAddress =>
  `${address}{global}` as SyncAddress;

export const partitionSyncAddress = (
  address: string,
  partition: { readonly field: string; readonly value: PartitionValue },
): SyncAddress =>
  `${address}{${normalizeName(partition.field)}=${label(partition.value)}}` as SyncAddress;

export const strategySyncAddress = (
  address: string,
  strategyName: string,
): SyncAddress => `${address}.${normalizeName(strategyName)}` as SyncAddress;
