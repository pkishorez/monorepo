export const offlineStorageGroupName = {
  sourceOfTruth: (schemaName: string): string => `sot/${schemaName}`,
  syncState: (schemaName: string): string => `state/${schemaName}`,
};
