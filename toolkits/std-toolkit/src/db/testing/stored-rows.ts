import { Arbitrary, Effect, Option, Result, Schema } from 'effect';
import { nextUlid } from '../../core/index.js';
import { inspectESchema } from '../../eschema/domain/introspection/index.js';
import { findNonPortableValue } from '../../eschema/domain/portable-value/index.js';
import type { StoredData, StoredItem } from '../std-table/contract/index.js';
import type { RegisteredEntity } from '../std-table/definition/index.js';
import type { DatabaseError } from '../std-table/error/index.js';
import { makeStoredItem, singleKey } from '../std-table/entity/index.js';
import { storedForm, type StdTable } from '../std-table/table/index.js';

// Generated rows a table could hold: values valid at one version of an
// entity, in that version's encoded form, stamped with it.

/** One generated row: the value it was written from, and its stored data. */
export interface GeneratedRow {
  readonly value: unknown;
  readonly data: StoredData;
}

/**
 * Rows `entity` can store at `version`. A value the version cannot store as
 * JSON is discarded, since no such row can exist.
 */
export const rowsAt = (
  entity: RegisteredEntity,
  version: string,
): Arbitrary.Arbitrary<GeneratedRow> => {
  const evolution = inspectESchema(entity.schema).evolutions.find(
    (candidate) => candidate.version === version,
  );
  if (evolution === undefined)
    throw new Error(`${entity.name} has no version ${version}`);
  const schema = evolution.schema as Schema.Codec<unknown, unknown>;
  const encode = Schema.encodeOption(schema);
  return Arbitrary.schema(Schema.toType(schema)).pipe(
    Arbitrary.filterMap((value: unknown) => {
      const encoded = encode(value);
      if (Option.isNone(encoded)) return Result.fail(value);
      const data = { ...(encoded.value as object), _v: version };
      return findNonPortableValue(data) === undefined
        ? Result.succeed({ value, data: data as StoredData })
        : Result.fail(value);
    }),
  );
};

/** Rows of `entity` at its latest version. */
export const latestRows = (
  entity: RegisteredEntity,
): Arbitrary.Arbitrary<GeneratedRow> =>
  rowsAt(entity, entity.schema.latestVersion);

/**
 * The stored item of a row at an old version, keyed from its value as it
 * was then. Only setup rewrites it, with fresh keys.
 */
export const oldItem = (
  entity: RegisteredEntity,
  row: GeneratedRow,
): Effect.Effect<StoredItem> =>
  Effect.map(nextUlid, (updated) =>
    entity.kind === 'keyed'
      ? makeStoredItem(
          entity,
          row.value as object,
          {
            value: row.data,
            meta: { _e: entity.name, _u: updated, _d: false, _v: row.data._v },
          },
          updated,
          false,
        )
      : {
          ...singleKey(entity.name),
          meta: { _e: entity.name, _u: updated, _d: false },
          data: row.data,
          keys: {},
        },
  );

/** The stored item of a latest row, written as the table writes it. */
export const latestItem = (
  table: StdTable,
  entity: RegisteredEntity,
  row: GeneratedRow,
): Effect.Effect<StoredItem, DatabaseError> =>
  Effect.flatMap(nextUlid, (updated) =>
    storedForm(table, entity.name, row.value as object, {
      _u: updated,
      _d: false,
    }),
  );
