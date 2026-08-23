import type { DecodedEntity } from 'std-toolkit/core';
import {
  TransferSchema,
  type Transfer,
} from '../../../contract/transfer/index.ts';
import { bankTable } from '../../table/index.ts';

export const transferEntity = bankTable
  .entity(TransferSchema)
  .primary({ pk: [] })
  .index('GSI1', 'byFrom', { pk: ['from'] })
  .index('GSI2', 'byTo', { pk: ['to'] })
  .build();

export type TransferRow = DecodedEntity<Transfer>;
