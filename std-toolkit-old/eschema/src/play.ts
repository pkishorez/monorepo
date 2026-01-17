import { Schema } from 'effect';
import * as v from 'valibot';
import z from 'zod';
import { makeESchema } from './eschema.js';
import { makeESchemaWithName } from './eschema-name.js';

const eschema = makeESchema({
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

const yyy = eschema.extend({ yyy: z.literal('test') });
type YType = typeof yyy.Type;

const eschemaName = makeESchemaWithName('MySchema', eschema);
const zzz = eschemaName.extend({ zzz: v.literal('test') });

const result = eschema.parse(
  { _v: 'v1', a: 'hello', b: 'hey' },
  { includeVersion: true },
);
console.log(result);
console.log(eschema.make(result.value));
console.log(eschema.makePartial({}));
