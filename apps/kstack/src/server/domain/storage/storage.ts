import { Schema } from 'effect';
import { StdTable } from '@kstackz/std-toolkit/db';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';
import {
  Account,
  Category,
  Entry,
  Preferences,
} from '../../../shared/ledger/index.ts';

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

// Preferences as they were before the device's Settings left them, under
// their old name. Nothing reads or writes them; they stay declared because
// the table's deploy guard refuses to drop an entity that has rows.
const RetiredPreferences = EntityESchema.make('preferences', 'userId', {
  currency: Schema.String,
  sound: Schema.Boolean,
  keys: Schema.Record(Schema.String, Schema.String),
})
  .evolve(
    'v2',
    { keysOn: Schema.Boolean, gesturesOn: Schema.Boolean },
    (before) => ({ ...before, keysOn: true, gesturesOn: true }),
  )
  .evolve('v3', { gestureSounds: Schema.Boolean }, (before) => ({
    ...before,
    gestureSounds: true,
  }))
  .evolve(
    'v4',
    {
      sound: null,
      keys: null,
      keysOn: null,
      gesturesOn: null,
      gestureSounds: null,
    },
    ({ userId, currency }) => ({ userId, currency }),
  )
  .build();

ledgerTable
  .entity(RetiredPreferences)
  .primary({ pk: ['userId'] })
  .index('LSI1', 'changes', { sk: ['_u'] })
  .build();
