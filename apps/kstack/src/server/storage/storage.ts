import { StdTable } from '@kstackz/std-toolkit/db';
import {
  Account,
  Category,
  Entry,
  Preferences,
} from '../../domain/ledger/index.ts';

/**
 * One table holds every user's money, each user one partition. Its local
 * index sorts each kind by its last change, so "everything after" is one
 * query.
 */
export const ledgerTable = StdTable.make('ledger')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .build();

export const accounts = ledgerTable
  .entity(Account)
  .primary({ pk: ['userId'] })
  .index('LSI1', 'changes', { sk: ['_u'] })
  .build();

export const categories = ledgerTable
  .entity(Category)
  .primary({ pk: ['userId'] })
  .index('LSI1', 'changes', { sk: ['_u'] })
  .build();

export const entries = ledgerTable
  .entity(Entry)
  .primary({ pk: ['userId'] })
  .index('LSI1', 'changes', { sk: ['_u'] })
  .build();

export const preferences = ledgerTable
  .entity(Preferences)
  .primary({ pk: ['userId'] })
  .index('LSI1', 'changes', { sk: ['_u'] })
  .build();
