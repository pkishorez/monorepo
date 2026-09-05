import { Effect } from 'effect';
import {
  EntitySchema,
  SingleEntitySchema,
  type DecodedEntity,
  type DecodedSingleEntity,
  type EncodedEntity,
} from '../../../core/index.js';
import type {
  AnyEntityESchema,
  AnyUnkeyedESchema,
} from '../../../eschema/index.js';
import { DatabaseError, DecodeFailed } from '../error/index.js';
import { encodeCompositeKey } from '../key/index.js';
import {
  type EncodedData,
  type JsonObject,
  type EncodedItem,
} from '../contract/index.js';
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

export const encode = <S extends AnyEntityESchema>(
  schema: S,
  value: S['Type'],
  entity: string,
  meta: DecodedEntity<S['Type']>['meta'] = {
    _e: entity,
    _u: '',
    _d: false,
  },
) =>
  EntitySchema(schema)
    .encode({ value, meta })
    .pipe(
      Effect.mapError(
        (cause) =>
          new DatabaseError({ reason: new DecodeFailed({ entity, cause }) }),
      ),
    );

export const decode = <S extends AnyEntityESchema>(
  schema: S,
  item: EncodedItem,
) =>
  EntitySchema(schema)
    .decode({ value: item.data, meta: item.meta })
    .pipe(
      Effect.mapError(
        (cause) =>
          new DatabaseError({
            reason: new DecodeFailed({ entity: schema.name, cause }),
          }),
      ),
    );

export const encodeSingle = <S extends AnyUnkeyedESchema>(
  schema: S,
  value: S['Type'],
  entity: string,
  meta: DecodedSingleEntity<S['Type']>['meta'] = {
    _e: entity,
    _u: '',
  },
) =>
  SingleEntitySchema(schema)
    .encode({ value, meta })
    .pipe(
      Effect.mapError(
        (cause) =>
          new DatabaseError({ reason: new DecodeFailed({ entity, cause }) }),
      ),
    );

export const decodeSingle = <S extends AnyUnkeyedESchema>(
  schema: S,
  item: EncodedItem,
) =>
  SingleEntitySchema(schema)
    .decode({
      value: item.data,
      meta: { _e: item.meta._e, _u: item.meta._u },
    })
    .pipe(
      Effect.mapError(
        (cause) =>
          new DatabaseError({
            reason: new DecodeFailed({ entity: schema.name, cause }),
          }),
      ),
    );

export const makeEncodedItem = (
  definition: KeyedEntityDefinition,
  encoded: EncodedEntity<EncodedData>,
  updated: string,
  deleted: boolean,
): EncodedItem => ({
  ...derivedKey(definition, encoded.value),
  meta: {
    _e: definition.name,
    _u: updated,
    _d: deleted,
  },
  data: encoded.value,
  keys: derivedIndexes(definition, { ...encoded.value, _u: updated }),
});

export const entityResult = <T>(
  item: EncodedItem,
  value: T,
): DecodedEntity<T> => ({ value, meta: item.meta });

export const singleKey = (name: string) => ({
  pk: encodeCompositeKey([name]),
  sk: encodeCompositeKey(['single']),
});
