import { Schema } from "effect";
import { AnyESchema } from "@std-toolkit/eschema";

export const MetaSchema = Schema.Struct({
  _v: Schema.String,
  _e: Schema.String,
  _d: Schema.Boolean,
  _u: Schema.String,
});

export type EntityType<T> = {
  value: T;
  meta: typeof MetaSchema.Type;
};

export const BroadcastSchema = Schema.Struct({
  _tag: Schema.Literal("@std-toolkit/broadcast"),
  values: Schema.Array(
    Schema.Struct({ meta: MetaSchema, value: Schema.Unknown }),
  ),
});

export const EntitySchema = <S extends AnyESchema>(eschema: S) =>
  Schema.Struct({
    value: Schema.Struct(eschema.schema) as Schema.Schema<S["Type"], S["Type"]>,
    meta: MetaSchema,
  });
