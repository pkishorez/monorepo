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
 * What belongs to one User's money rather than to the device, one per User:
 * the currency it is counted in.
 */
export const Preferences = EntityESchema.make('user-preferences', 'userId', {
  currency: Schema.String,
}).build();
export type Preferences = typeof Preferences.Type;

export const defaultPreferences = (userId: string): Preferences => ({
  userId,
  currency: 'USD',
});
