import { appTable } from '../app-table/index.ts';
import { alchemyStateStoreSchema } from './schema.ts';

export const alchemyStateStoreEntity = appTable
  .entity(alchemyStateStoreSchema)
  .primary({ pk: ['userId'] })
  .build();
