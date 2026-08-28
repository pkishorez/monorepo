import { Schema } from 'effect';
import { EntityESchema } from 'std-toolkit/eschema';

export const AccountSchema = EntityESchema.make('account', 'id', {
  name: Schema.String,
  balance: Schema.Number,
}).build();

export type Account = (typeof AccountSchema)['Type'];
