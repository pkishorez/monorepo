type AddressValue = string | number | boolean;

const normalized = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const normalizeSyncName = (value: string): string => {
  const name = normalized(value);
  if (name.length === 0) {
    throw new Error('[sync] a name must contain at least one letter or number');
  }
  return name;
};

export const syncAddress = (name: string): string => normalizeSyncName(name);

export const qualifyCollectionName = (
  syncName: string,
  schemaName: string,
): string => `${syncName}.${normalizeSyncName(schemaName)}`;

export const collectionSyncAddress = (
  syncName: string,
  schemaName: string,
): string => qualifyCollectionName(normalizeSyncName(syncName), schemaName);

export const globalSyncAddress = (collectionName: string): string =>
  `${collectionName}{global}`;

const partitionValueLabel = (value: AddressValue): string =>
  normalized(String(value)) || 'empty';

export const partitionSyncAddress = (
  collectionName: string,
  partition: { readonly field: string; readonly value: AddressValue },
): string =>
  `${collectionName}{${normalizeSyncName(partition.field)}=${partitionValueLabel(partition.value)}}`;

export const strategySyncAddress = (
  address: string,
  strategyName: string,
): string => `${address}.${normalizeSyncName(strategyName)}`;
