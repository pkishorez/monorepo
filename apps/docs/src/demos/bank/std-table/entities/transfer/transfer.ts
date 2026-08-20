import type { DecodedEntity } from 'std-toolkit/core';
import {
  TransferSchema,
  type Transfer,
} from '../../../contract/transfer/index.ts';
import { bankTable } from '../../table/index.ts';

export const transferEntity = bankTable
  .entity(TransferSchema)
  .primary({ pk: [] })
  .index('GSI1', 'bySender', { pk: ['from'], sk: ['id'] })
  .index('GSI2', 'byReceiver', { pk: ['to'], sk: ['id'] })
  .build();

export type TransferRow = DecodedEntity<Transfer>;
