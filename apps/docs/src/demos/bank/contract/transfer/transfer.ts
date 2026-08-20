import { Schema } from 'effect';
import { EntityESchema } from 'std-toolkit/eschema';

export const TransferSchema = EntityESchema.make('transfer', 'id', {
  from: Schema.String,
  to: Schema.String,
  amount: Schema.Int,
}).build();

export type Transfer = (typeof TransferSchema)['Type'];

export const isValidAmount = (amount: number): boolean =>
  Number.isInteger(amount) && amount > 0;
