import { SingleEntityESchema } from '@std-toolkit/eschema';
import { Schema } from 'effect';

export const CategoryTypeSchema = Schema.Literal(
  'income',
  'spend',
  'transfer',
  'ignore',
);

export const SettingsSchema = SingleEntityESchema.make('Settings', {
  categoryTypes: Schema.Record({
    key: Schema.String,
    value: CategoryTypeSchema,
  }),
}).build();

export const DEFAULT_SETTINGS: typeof SettingsSchema.Type = {
  categoryTypes: {},
};
