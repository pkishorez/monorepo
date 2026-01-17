import * as v from 'valibot';

const rawMetaSchema = v.object({
  _e: v.string(),
  _v: v.string(),
  _i: v.number(),
  _u: v.string(),
  _d: v.boolean(),
});
const rawBroadcastSchema = <S extends v.AnySchema>(value: S) =>
  v.object({
    _tag: v.literal('std-toolkit/broadcast'),
    value,
    meta: rawMetaSchema,
  });

type MetadataSchemaType = Exclude<
  (typeof rawMetaSchema)['~types'],
  undefined
>['output'];
export const metaSchema = {
  make: (value: MetadataSchemaType) => v.parse(rawMetaSchema, value),
  parse: (value: unknown) => v.parse(rawMetaSchema, value),
  Type: null as any as MetadataSchemaType,
};

export type DerivableMeta = Pick<typeof metaSchema.Type, '_u'>;
export type BroadcastSchemaType<T = any> = Omit<
  Exclude<ReturnType<typeof rawBroadcastSchema>['~types'], undefined>['output'],
  'value'
> & { value: T };

export const broadcastSchema = {
  makeSchema: <T extends v.AnySchema>(schema: T) => rawBroadcastSchema(schema),
  make: (value: BroadcastSchemaType) =>
    v.parse(rawBroadcastSchema(v.any()), value),
  parse: (value: unknown) => v.parse(rawBroadcastSchema(v.any()), value),
  Type: null as any as BroadcastSchemaType,
};
