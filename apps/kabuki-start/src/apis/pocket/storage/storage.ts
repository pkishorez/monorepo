import { StdTable } from '@kestack/std-toolkit/db';
import { Entry, Wallet } from '../domain/index.ts';

/*
 * Where Pocket keeps its records: one std Table, `pocket`, on the Worker's
 * D1 database. Each kind of record is partitioned by the Account it belongs
 * to, and indexed by when it last changed (`_u`), which is the order the
 * reads page through.
 */

export const pocketTable = StdTable.make('pocket')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .build();

export const wallets = pocketTable
  .entity(Wallet)
  .primary({ pk: ['userId'] })
  .index('LSI1', 'byUpdate', { sk: ['_u'] })
  .build();

export const entries = pocketTable
  .entity(Entry)
  .primary({ pk: ['userId'] })
  .index('LSI1', 'byUpdate', { sk: ['_u'] })
  .build();
