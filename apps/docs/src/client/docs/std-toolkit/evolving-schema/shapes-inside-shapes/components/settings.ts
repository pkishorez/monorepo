import { Schema } from 'effect';
import { ESchema, ValueESchema } from '@kestack/std-toolkit/schema';

// The theme from the last page: free text in v1, one of two words in v2.
export const Theme = ValueESchema.make('Theme', Schema.String)
  .evolve('v2', Schema.Literals(['light', 'dark']), (text) =>
    text === 'night' || text === 'dark' ? 'dark' : 'light',
  )
  .build();

// Settings holds the theme through its `schema`. Settings itself has only
// ever had one version: it never changed.
export const Settings = ESchema.make('Settings', {
  language: Schema.String,
  theme: Theme.schema,
}).build();
