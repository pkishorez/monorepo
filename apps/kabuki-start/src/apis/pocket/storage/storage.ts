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
  .entity(Wallet, (e) =>
    e.primary({ pk: ['userId'] }).index('LSI1', 'byUpdate', { sk: ['_u'] }),
  )
  .entity(Entry, (e) =>
    e.primary({ pk: ['userId'] }).index('LSI1', 'byUpdate', { sk: ['_u'] }),
  )
  .build();

export const wallets = pocketTable.Wallet;
export const entries = pocketTable.Entry;
