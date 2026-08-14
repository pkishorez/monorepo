import { Effect } from 'effect';
import type { EntityType } from '../../../core/index.js';
import type {
  AnyEntityESchema,
  AnyUnkeyedESchema,
  ESchemaType,
} from '../../../eschema/index.js';
import { DatabaseError, DecodeFailed } from '../error/index.js';
import { encodeCompositeKey } from '../key/index.js';
import { type JsonObject, type EncodedItem } from '../contract/index.js';
import { deriveStorageIndexes, deriveStorageKey } from '../key/index.js';
import type {
  AccessPatternDefinition,
  KeyedEntityDefinition,
} from '../definition/index.js';

export const fieldStrings = (value: JsonObject, fields: readonly string[]) =>
  fields.map((field) => {
    const component = value[field];
    if (typeof component !== 'string')
      throw new Error(`Index component "${field}" must encode to a string`);
    return component;
  });

export const derivedKey = (
  entity: KeyedEntityDefinition,
  value: JsonObject,
  pattern?: AccessPatternDefinition,
) => {
  const derivation = pattern ?? entity.primary;
  return deriveStorageKey(entity.name, value, derivation);
};

const indexAttributes = (
  entity: KeyedEntityDefinition,
  pattern: AccessPatternDefinition,
) => {
  if (pattern.index === undefined) return undefined;
  if (pattern.kind === 'lsi') {
    const index = entity.table.localSecondaryIndexes[pattern.index];
    return index === undefined ? undefined : { sk: index.sk };
  }
  const index = entity.table.globalSecondaryIndexes[pattern.index];
  return index === undefined ? undefined : { pk: index.pk, sk: index.sk };
};

export const derivedIndexes = (
  entity: KeyedEntityDefinition,
  value: JsonObject,
) =>
  deriveStorageIndexes(
    entity.name,
    Object.values(entity.accessPatterns).map((pattern) => ({
      ...pattern,
      attributes: indexAttributes(entity, pattern),
    })),
    value,
  );

export const encode = <S extends AnyEntityESchema | AnyUnkeyedESchema>(
  schema: S,
  value: ESchemaType<S>,
  entity: string,
) =>
  schema
    .encode(value)
    .pipe(
      Effect.mapError(
        (cause) =>
          new DatabaseError({ reason: new DecodeFailed({ entity, cause }) }),
      ),
    );

export const decode = <S extends AnyEntityESchema | AnyUnkeyedESchema>(
  schema: S,
  item: EncodedItem,
) =>
  schema.decode(item.data).pipe(
    Effect.mapError(
      (cause) =>
        new DatabaseError({
          reason: new DecodeFailed({ entity: schema.name, cause }),
        }),
    ),
  );

export const makeEncodedItem = (
  definition: KeyedEntityDefinition,
  encoded: JsonObject,
  version: string,
  deleted: boolean,
): EncodedItem => ({
  ...derivedKey(definition, encoded),
  meta: {
    _e: definition.name,
    _v: String(encoded._v),
    _u: version,
    _d: deleted,
  },
  data: encoded,
  keys: derivedIndexes(definition, { ...encoded, _u: version }),
});

export const entityResult = <T>(
  item: EncodedItem,
  value: T,
): EntityType<T> => ({
  value,
  meta: item.meta,
});

export const singleKey = (name: string) => ({
  pk: encodeCompositeKey([name]),
  sk: encodeCompositeKey(['single']),
});
