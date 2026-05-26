import { EntityESchema } from '@std-toolkit/eschema';
import { Schema } from 'effect';

export const CategorySettingSchema = EntityESchema.make(
  'CategorySetting',
  'category',
  {
    type: Schema.Literal('income', 'spend', 'transfer', 'ignore'),
  },
).build();
