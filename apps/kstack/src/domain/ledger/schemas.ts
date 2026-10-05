import { Schema } from 'effect';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';

/** Money in or out of an Account. */
export const Way = Schema.Literals(['in', 'out']);
export type Way = typeof Way.Type;

/** Where money sits. */
export const Account = EntityESchema.make('account', 'id', {
  userId: Schema.String,
  name: Schema.String,
  kind: Schema.Literals(['cash', 'bank', 'card', 'savings']),
  createdAt: Schema.String,
}).build();
export type Account = typeof Account.Type;

/** What money was for, and its Budget in cents a month: 0 is none. */
export const Category = EntityESchema.make('category', 'id', {
  userId: Schema.String,
  name: Schema.String,
  /** The way money of it usually goes. */
  way: Way,
  /** One of ICONS, by name. */
  icon: Schema.String,
  budget: Schema.Number,
  createdAt: Schema.String,
}).build();
export type Category = typeof Category.Type;

/** One movement of money; `cents` is never negative, `way` says which. */
export const Entry = EntityESchema.make('entry', 'id', {
  userId: Schema.String,
  accountId: Schema.String,
  categoryId: Schema.String,
  cents: Schema.Number,
  way: Way,
  memo: Schema.String,
  /** The day it happened, `YYYY-MM-DD`. */
  day: Schema.String,
  createdAt: Schema.String,
}).build();
export type Entry = typeof Entry.Type;

/**
 * One user's own settings, one per user. `keys` are their own Bindings,
 * written as people write them (`mod+k`, `g g`), by Action id. `keysOn`
 * and `gesturesOn` say whether Keys and the Thumb Lock work; before v2
 * both always did.
 */
export const Preferences = EntityESchema.make('preferences', 'userId', {
  currency: Schema.String,
  sound: Schema.Boolean,
  keys: Schema.Record(Schema.String, Schema.String),
})
  .evolve(
    'v2',
    { keysOn: Schema.Boolean, gesturesOn: Schema.Boolean },
    (before) => ({ ...before, keysOn: true, gesturesOn: true }),
  )
  .build();
export type Preferences = typeof Preferences.Type;

export const defaultPreferences = (userId: string): Preferences => ({
  userId,
  currency: 'USD',
  sound: true,
  keys: {},
  keysOn: true,
  gesturesOn: true,
});
