import { SingleEntityESchema } from '@std-toolkit/eschema';
import { Schema } from 'effect';

export const CategoryTypeSchema = Schema.Literals([
  'income',
  'spend',
  'transfer',
  'ignore',
]);

export const SettingsSchema = SingleEntityESchema.make('Settings', {
  categoryTypes: Schema.Record(Schema.String, CategoryTypeSchema),
}).build();

export const DEFAULT_SETTINGS: typeof SettingsSchema.Type = {
  categoryTypes: {},
};
