import type { DecodedEntity } from 'std-toolkit/core';
import {
  TransferSchema,
  type Transfer,
} from '../../../contract/transfer/index.ts';
import { bankTable } from '../../table/index.ts';

export const transferEntity = bankTable
  .entity(TransferSchema)
  .primary({ pk: [] })
  .build();

export type TransferRow = DecodedEntity<Transfer>;
