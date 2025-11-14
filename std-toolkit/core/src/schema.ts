import * as v from 'valibot';

export const valibot = v;
const schema = v.object({
  _e: v.string(),
  _v: v.string(),
  _i: v.number(),
  _u: v.string(),
  _d: v.boolean(),
});

type SchemaType = Exclude<(typeof schema)['~types'], undefined>['output'];
export const metaSchema = {
  make: (value: SchemaType) => v.parse(schema, value),
  parse: (value: unknown) => v.parse(schema, value),
  Type: null as any as SchemaType,
};
