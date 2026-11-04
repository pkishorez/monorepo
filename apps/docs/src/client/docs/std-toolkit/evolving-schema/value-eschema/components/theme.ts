import { Schema } from 'effect';
import { ValueESchema } from '@kestack/std-toolkit/schema';

// v1 kept the theme as free text. v2 allows only two words, and the
// migration maps every old text onto one of them.
export const Theme = ValueESchema.make('Theme', Schema.String)
  .evolve('v2', Schema.Literals(['light', 'dark']), (text) =>
    text === 'night' || text === 'dark' ? 'dark' : 'light',
  )
  .build();
