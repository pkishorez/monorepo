import type { Brand } from './brand.js';
import { normalizeName, type StdSyncName } from './sync-name.js';

export type CollectionName = string & Brand<'CollectionName'>;

export const collectionName = (
  sync: StdSyncName,
  schemaName: string,
): CollectionName => `${sync}.${normalizeName(schemaName)}` as CollectionName;
