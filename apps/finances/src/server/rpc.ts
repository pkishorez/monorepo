import { Rpc } from 'effect/unstable/rpc';
import { Schema, Struct } from 'effect';
import { EntityESchema, type StructFieldsSchema } from 'std-toolkit/eschema';
import { EntitySchema, StdToolkitError } from 'std-toolkit/core';

type OmitIdField<T, IdField extends string> = Omit<T, IdField>;

const makeInsertRpc = <
  N extends string,
  Id extends string,
  V extends string,
  F extends StructFieldsSchema,
  P extends string = '',
>(
  eschema: EntityESchema<N, Id, V, F>,
  prefix?: P,
) => {
  const { [eschema.idField]: _id, ...fieldsWithoutId } = eschema.fields;

  const payloadSchema = Schema.Struct(fieldsWithoutId as OmitIdField<F, Id>);
  const p = (prefix ?? '') as P;

  return Rpc.make(`${p}insert${eschema.name}` as `${P}insert${N}`, {
    payload: payloadSchema,
    success: EntitySchema(eschema),
    error: StdToolkitError,
  });
};

const makeUpdateRpc = <
  N extends string,
  Id extends string,
  V extends string,
  F extends StructFieldsSchema,
  P extends string = '',
>(
  eschema: EntityESchema<N, Id, V, F>,
  prefix?: P,
) => {
  const { [eschema.idField]: _id, ...fieldsWithoutId } = eschema.fields;

  const updatesSchema = Schema.Struct(
    fieldsWithoutId as OmitIdField<F, Id>,
  ).mapFields(Struct.map(Schema.optional));

  const payloadSchema = Schema.Struct({
    [eschema.idField]: Schema.String,
    updates: updatesSchema,
  } as Record<Id, typeof Schema.String> & { updates: typeof updatesSchema });

  const p = (prefix ?? '') as P;

  return Rpc.make(`${p}update${eschema.name}` as `${P}update${N}`, {
    payload: payloadSchema,
    success: EntitySchema(eschema),
    error: StdToolkitError,
  });
};

const makeDeleteRpc = <
  N extends string,
  Id extends string,
  V extends string,
  F extends StructFieldsSchema,
  P extends string = '',
>(
  eschema: EntityESchema<N, Id, V, F>,
  prefix?: P,
) => {
  const payloadSchema = Schema.Struct({
    [eschema.idField]: Schema.String,
  } as Record<Id, typeof Schema.String>);

  const p = (prefix ?? '') as P;

  return Rpc.make(`${p}delete${eschema.name}` as `${P}delete${N}`, {
    payload: payloadSchema,
    success: EntitySchema(eschema),
    error: StdToolkitError,
  });
};

const makeGetRpc = <
  N extends string,
  Id extends string,
  V extends string,
  F extends StructFieldsSchema,
  P extends string = '',
>(
  eschema: EntityESchema<N, Id, V, F>,
  prefix?: P,
) => {
  const payloadSchema = Schema.Struct({
    [eschema.idField]: Schema.String,
  } as Record<Id, typeof Schema.String>);

  const p = (prefix ?? '') as P;

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
  P extends string = '',
>(
  eschema: EntityESchema<N, Id, V, F>,
  prefix?: P,
) => {
  return [
    makeGetRpc(eschema, prefix),
    makeInsertRpc(eschema, prefix),
    makeUpdateRpc(eschema, prefix),
    makeDeleteRpc(eschema, prefix),
  ];
};
