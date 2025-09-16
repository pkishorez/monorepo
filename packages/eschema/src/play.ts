import { Schema } from 'effect';
import { ESchema } from './eschema.js';

export const eschema = ESchema.make(
  // br
  'v1', // br
  Schema.Struct({ v1: Schema.String }),
)
  .evolve(
    'v2', // br
    Schema.Struct({ v1: Schema.String, v2: Schema.String }),
    (old, v) =>
      v({
        ...old,
        v2: 'test',
      }),
  )
  .evolve(
    'v3',
    ({ v1 }) => Schema.Struct({ ...v1.fields, v3: Schema.String }),
    (old) => ({
      ...old,
      v3: 'hello',
    }),
  )
  .build();

export const latest = eschema.schema;
