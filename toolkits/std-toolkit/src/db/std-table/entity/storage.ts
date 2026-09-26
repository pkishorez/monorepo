import { Effect } from 'effect';
import {
  EntitySchema,
  SingleEntitySchema,
  type Entity,
  type EntityMeta,
  type SingleEntityMeta,
} from '../../../core/index.js';
import type {
  AnyEntityESchema,
  AnyUnkeyedESchema,
} from '../../../eschema/index.js';
import { DatabaseError, DecodeFailed } from '../error/index.js';
import { type StoredData, type StoredItem } from '../contract/index.js';
import {
  deriveStorageIndexes,
  deriveStorageKey,
  encodeCompositeKey,
  valueReader,
  type KeyReader,
} from '../key/index.js';
import type {
  AccessPatternDefinition,
  KeyedEntityDefinition,
} from '../definition/index.js';

export const derivedKey = (
  entity: KeyedEntityDefinition,
  read: KeyReader,
  pattern?: AccessPatternDefinition,
) => deriveStorageKey(entity.name, read, pattern ?? entity.primary);

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
  read: KeyReader,
) =>
  deriveStorageIndexes(
    entity.name,
    Object.values(entity.accessPatterns).map((pattern) => ({
      ...pattern,
      attributes: indexAttributes(entity, pattern),
    })),
    read,
  );

const versioned = <M extends { readonly _v: string }>(entity: {
  readonly value: object;
  readonly meta: M;
}) => ({
  value: { ...entity.value, _v: entity.meta._v } as StoredData,
  meta: entity.meta,
});

const unversioned = (item: StoredItem) => {
  const { _v, ...value } = item.data;
  return { value, _v };
};

const decodeFailed = (entity: string) => (cause: Error) =>
  new DatabaseError({ reason: new DecodeFailed({ entity, cause }) });

export const toStored = <S extends AnyEntityESchema>(
  schema: S,
  value: S['Type'],
  entity: string,
  meta: Omit<EntityMeta, '_v'> = { _e: entity, _u: '', _d: false },
) =>
  EntitySchema(schema)
    .encode({ value, meta: { ...meta, _v: schema.latestVersion } })
    .pipe(Effect.map(versioned), Effect.mapError(decodeFailed(entity)));

export const fromStored = <S extends AnyEntityESchema>(
  schema: S,
  item: StoredItem,
) => {
  const { value, _v } = unversioned(item);
  return EntitySchema(schema)
    .decode({ value, meta: { ...item.meta, _v } })
    .pipe(Effect.mapError(decodeFailed(schema.name)));
};

export const toStoredSingle = <S extends AnyUnkeyedESchema>(
  schema: S,
  value: S['Type'],
  entity: string,
  meta: Omit<SingleEntityMeta, '_v'> = { _e: entity, _u: '' },
) =>
  SingleEntitySchema(schema)
    .encode({ value, meta: { ...meta, _v: schema.latestVersion } })
    .pipe(Effect.map(versioned), Effect.mapError(decodeFailed(entity)));

export const fromStoredSingle = <S extends AnyUnkeyedESchema>(
  schema: S,
  item: StoredItem,
) => {
  const { value, _v } = unversioned(item);
  return SingleEntitySchema(schema)
    .decode({ value, meta: { _e: item.meta._e, _u: item.meta._u, _v } })
    .pipe(Effect.mapError(decodeFailed(schema.name)));
};

/** Keys are read from the value; the item stores its encoded form. */
export const makeStoredItem = (
  definition: KeyedEntityDefinition,
  value: object,
  encoded: Entity<StoredData>,
  updated: string,
  deleted: boolean,
): StoredItem => ({
  ...derivedKey(definition, valueReader(value)),
  meta: {
    _e: definition.name,
    _u: updated,
    _d: deleted,
  },
  data: encoded.value,
  keys: derivedIndexes(definition, valueReader(value, updated)),
});

export const entityResult = <T>(item: StoredItem, value: T): Entity<T> => ({
  value,
  meta: { ...item.meta, _v: item.data._v },
});

export const singleKey = (name: string) => ({
  pk: encodeCompositeKey([name]),
  sk: encodeCompositeKey(['single']),
});
