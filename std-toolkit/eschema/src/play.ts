import { Schema } from 'effect';
import { ESchema } from './eschema.js';
import * as v from 'valibot';
import z from 'zod';

const eschema = ESchema.make({
  a: Schema.standardSchemaV1(Schema.String),
  b: z.string(),
})
  .evolve(
    'v2',
    ({ v1 }) => ({
      ...v1,
      test: v.picklist(['test', 'hello']),
      v: Schema.standardSchemaV1(Schema.String),
    }),
    (old) => ({ ...old, test: 'test' as const, v: 'test' }),
  )
  .build();

const r = eschema.Type;

const result = eschema.parse(
  { _v: 'v1', a: 'hello', b: 'hey' },
  { includeVersion: true },
);
console.log(result);
console.log(eschema.make(result.value));
console.log(eschema.makePartial({}));
