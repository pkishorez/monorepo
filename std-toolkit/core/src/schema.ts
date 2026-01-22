import { Schema } from "effect";
import { AnyESchema } from "@std-toolkit/eschema";

export const metaSchema = Schema.Struct({
  _v: Schema.String,
  _e: Schema.String,
  _d: Schema.Boolean,
  _u: Schema.String,
});
export type EntityType<T> = {
  value: T;
  meta: typeof metaSchema.Type;
};
export const entitySchema = <S extends AnyESchema>(
  eschema: S,
): Schema.Schema<EntityType<S["Type"]>> =>
  Schema.Struct({
    value: Schema.Struct(eschema.schema),
    meta: metaSchema,
  }) as any;
