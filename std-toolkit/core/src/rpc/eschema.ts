import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";
import { ESchema, type StructFieldsSchema } from "@std-toolkit/eschema";
import { EntitySchema } from "../schema";

export class StdToolkitError extends Schema.TaggedError<StdToolkitError>()(
  "StdToolkitError",
  {
    message: Schema.String,
    code: Schema.optional(Schema.String),
  },
) {}

type OmitIdField<T, IdField extends string> = Omit<T, IdField>;

export const makeInsertRpc = <
  N extends string,
  Id extends string,
  V extends string,
  F extends StructFieldsSchema,
  P extends string = "",
>(
  eschema: ESchema<N, Id, V, F>,
  prefix?: P,
) => {
  const { [eschema.idField]: _id, ...fieldsWithoutId } = eschema.fields;

  const payloadSchema = Schema.Struct(fieldsWithoutId as OmitIdField<F, Id>);
  const p = (prefix ?? "") as P;

  return Rpc.make(`${p}insert${eschema.name}` as `${P}insert${N}`, {
    payload: payloadSchema,
    success: EntitySchema(eschema),
    error: StdToolkitError,
  });
};

export const makeUpdateRpc = <
  N extends string,
  Id extends string,
  V extends string,
  F extends StructFieldsSchema,
  P extends string = "",
>(
  eschema: ESchema<N, Id, V, F>,
  prefix?: P,
) => {
  const { [eschema.idField]: _id, ...fieldsWithoutId } = eschema.fields;

  const updatesSchema = Schema.partial(
    Schema.Struct(fieldsWithoutId as OmitIdField<F, Id>),
  );

  const payloadSchema = Schema.Struct({
    [eschema.idField]: Schema.String,
    updates: updatesSchema,
  } as Record<Id, typeof Schema.String> & { updates: typeof updatesSchema });

  const p = (prefix ?? "") as P;

  return Rpc.make(`${p}update${eschema.name}` as `${P}update${N}`, {
    payload: payloadSchema,
    success: EntitySchema(eschema),
    error: StdToolkitError,
  });
};

export const makeDeleteRpc = <
  N extends string,
  Id extends string,
  V extends string,
  F extends StructFieldsSchema,
  P extends string = "",
>(
  eschema: ESchema<N, Id, V, F>,
  prefix?: P,
) => {
  const payloadSchema = Schema.Struct({
    [eschema.idField]: Schema.String,
  } as Record<Id, typeof Schema.String>);

  const p = (prefix ?? "") as P;

  return Rpc.make(`${p}delete${eschema.name}` as `${P}delete${N}`, {
    payload: payloadSchema,
    success: EntitySchema(eschema),
    error: StdToolkitError,
  });
};

export const makeGetRpc = <
  N extends string,
  Id extends string,
  V extends string,
  F extends StructFieldsSchema,
  P extends string = "",
>(
  eschema: ESchema<N, Id, V, F>,
  prefix?: P,
) => {
  const payloadSchema = Schema.Struct({
    [eschema.idField]: Schema.String,
  } as Record<Id, typeof Schema.String>);

  const p = (prefix ?? "") as P;

  return Rpc.make(`${p}get${eschema.name}` as `${P}get${N}`, {
    payload: payloadSchema,
    success: Schema.NullOr(EntitySchema(eschema)),
    error: StdToolkitError,
  });
};

export const makeEntityRpcGroup = <
  N extends string,
  Id extends string,
  V extends string,
  F extends StructFieldsSchema,
  P extends string = "",
>(
  eschema: ESchema<N, Id, V, F>,
  prefix?: P,
) => {
  return RpcGroup.make(
    makeGetRpc(eschema, prefix),
    makeInsertRpc(eschema, prefix),
    makeUpdateRpc(eschema, prefix),
    makeDeleteRpc(eschema, prefix),
  );
};
