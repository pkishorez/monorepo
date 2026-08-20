import type { DecodedEntity } from 'std-toolkit/core';
import {
  AccountSchema,
  type Account,
} from '../../../contract/account/index.ts';
import { bankTable } from '../../table/index.ts';

export const accountEntity = bankTable
  .entity(AccountSchema)
  .primary({ pk: [] })
  .index('GSI1', 'byUpdated', { pk: [] })
  .build();

export type AccountRow = DecodedEntity<Account>;
